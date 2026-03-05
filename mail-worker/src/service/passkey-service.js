import { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse } from '@simplewebauthn/server';
import { v4 as uuidv4 } from 'uuid';
import result from '../model/result';
import JwtUtils from '../utils/jwt-utils';
import BizError from '../error/biz-error';
import constant from '../const/constant';
import KvConst from '../const/kv-const';
import dayjs from 'dayjs';
import userService from './user-service';

const rpName = 'Cloud Mail';
// Note: Depending on the host, rpID could be dinamic. For simplicity using window.location.hostname equivalent from the headers if possible, or reading from config.
// Here we'll pass rpID computed dynamically from the incoming request.

export default {
    getRpID(c) {
        let rpId = c.req.header('host')?.split(':')[0] || 'localhost';
        if (rpId === '127.0.0.1') {
            rpId = 'localhost';
        }
        return rpId;
    },

    getOrigin(c) {
        let origin = c.req.header('origin');
        if (origin) {
            return origin;
        }
        const protocol = c.req.header('x-forwarded-proto') || 'http';
        const host = c.req.header('host') || 'localhost:5173';
        return `${protocol}://${host}`;
    },

    async generateRegisterOptions(c, userId) {
        const userRow = await c.env.db.prepare('SELECT email FROM user WHERE user_id = ?').bind(userId).first();
        if (!userRow) throw new BizError('User not found');

        const userPasskeys = await c.env.db.prepare('SELECT id, transports FROM passkey_credentials WHERE user_id = ?').bind(userId).all();
        
        const options = await generateRegistrationOptions({
            rpName,
            rpID: this.getRpID(c),
            userID: new TextEncoder().encode(userId.toString()),
            userName: userRow.email,
            attestationType: 'none',
            excludeCredentials: userPasskeys.results.map(cred => ({
                id: cred.id,
                transports: cred.transports ? JSON.parse(cred.transports) : ['internal']
            })),
            authenticatorSelection: {
                residentKey: 'required',
                userVerification: 'preferred',
            },
        });

        // Store challenge
        const challengeId = uuidv4();
        await c.env.db.prepare('INSERT INTO passkey_challenges(id, challenge, expires_at) VALUES (?, ?, ?)')
            .bind(challengeId, options.challenge, Date.now() + 60000)
            .run();

        return { ...options, challengeId };
    },

    async verifyRegister(c, userId, challengeId, response) {
        const challengeRow = await c.env.db.prepare('SELECT challenge, expires_at FROM passkey_challenges WHERE id = ?').bind(challengeId).first();
        if (!challengeRow) throw new BizError('Invalid or expired challenge');

        // If the challenge is expired, clean up and fail before verification
        if (challengeRow.expires_at < Date.now()) {
            await c.env.db.prepare('DELETE FROM passkey_challenges WHERE id = ? OR expires_at < ?').bind(challengeId, Date.now()).run();
            throw new BizError('Invalid or expired challenge');
        }
        
        // Cleanup expired (and this challenge) now that we've validated it's not expired
        await c.env.db.prepare('DELETE FROM passkey_challenges WHERE id = ? OR expires_at < ?').bind(challengeId, Date.now()).run();

        const verification = await verifyRegistrationResponse({
            response,
            expectedChallenge: challengeRow.challenge,
            expectedOrigin: this.getOrigin(c),
            expectedRPID: this.getRpID(c),
        });

        if (verification.verified) {
            const { registrationInfo } = verification;
            const { id, publicKey, counter, transports } = registrationInfo.credential;

            const existing = await c.env.db.prepare('SELECT id FROM passkey_credentials WHERE user_id = ? LIMIT 1').bind(userId).first();
            if (existing) throw new BizError('Already have a passkey registered. Delete it first.');

            await c.env.db.prepare('INSERT INTO passkey_credentials (id, user_id, public_key, counter, transports) VALUES (?, ?, ?, ?, ?)')
                .bind(
                    id,
                    userId,
                    JSON.stringify(Array.from(publicKey)),
                    counter,
                    JSON.stringify(transports || [])
                ).run();
                
            return { ok: true };
        }
        
        throw new BizError('Verification failed');
    },

    async generateAuthOptions(c) {
        const options = await generateAuthenticationOptions({
            rpID: this.getRpID(c),
            userVerification: 'preferred',
        });

        const challengeId = uuidv4();
        await c.env.db.prepare('INSERT INTO passkey_challenges(id, challenge, expires_at) VALUES (?, ?, ?)')
            .bind(challengeId, options.challenge, Date.now() + 60000)
            .run();

        return { ...options, challengeId };
    },

    async verifyAuth(c, body) {
        const { challengeId, response } = body;
        const challengeRow = await c.env.db.prepare('SELECT challenge, expires_at FROM passkey_challenges WHERE id = ?').bind(challengeId).first();
        if (!challengeRow) throw new BizError('Invalid or expired challenge');

        await c.env.db.prepare('DELETE FROM passkey_challenges WHERE id = ? OR expires_at < ?').bind(challengeId, Date.now()).run();

        const credId = response.id;
        const credRow = await c.env.db.prepare('SELECT * FROM passkey_credentials WHERE id = ?').bind(credId).first();
        if (!credRow) throw new BizError('Passkey not found');

        const verification = await verifyAuthenticationResponse({
            response,
            expectedChallenge: challengeRow.challenge,
            expectedOrigin: this.getOrigin(c),
            expectedRPID: this.getRpID(c),
            credential: {
                id: credRow.id,
                publicKey: new Uint8Array(JSON.parse(credRow.public_key)),
                counter: credRow.counter,
                transports: credRow.transports ? JSON.parse(credRow.transports) : ['internal']
            }
        });

        if (verification.verified) {
            const { authenticationInfo } = verification;
            await c.env.db.prepare('UPDATE passkey_credentials SET counter = ? WHERE id = ?')
                .bind(authenticationInfo.newCounter, credRow.id).run();

            const userRow = await userService.selectById(c, credRow.user_id);
            if (!userRow) throw new BizError('User not found');

            const uuid = uuidv4();
            const jwt = await JwtUtils.generateToken(c, { userId: userRow.userId, token: uuid });

            let authInfo = await c.env.kv.get(KvConst.AUTH_INFO + userRow.userId, { type: 'json' });
            if (authInfo && (authInfo.user.email === userRow.email)) {
                if (authInfo.tokens.length > 10) {
                    authInfo.tokens.shift();
                }
                authInfo.tokens.push(uuid);
            } else {
                authInfo = {
                    tokens: [uuid],
                    user: userRow,
                    refreshTime: dayjs().toISOString()
                };
            }

            try {
                await userService.updateUserInfo(c, userRow.userId);
            } catch (e) {
                console.warn(e);
            }

            await c.env.kv.put(KvConst.AUTH_INFO + userRow.userId, JSON.stringify(authInfo), { expirationTtl: constant.TOKEN_EXPIRE || 604800 });

            return jwt;
        }

        throw new BizError('Authentication failed');
    },

    async listUserPasskeys(c, userId) {
        const passkeys = await c.env.db.prepare('SELECT id FROM passkey_credentials WHERE user_id = ?').bind(userId).all();
        return passkeys.results;
    },

    async deletePasskey(c, userId, passkeyId) {
        await c.env.db.prepare('DELETE FROM passkey_credentials WHERE user_id = ? AND id = ?').bind(userId, passkeyId).run();
    }
}