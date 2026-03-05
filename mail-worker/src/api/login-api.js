import app from '../hono/hono';
import loginService from '../service/login-service';
import result from '../model/result';
import userContext from '../security/user-context';
import passkeyService from '../service/passkey-service';

app.post('/login', async (c) => {
	const token = await loginService.login(c, await c.req.json());
	return c.json(result.ok({ token: token }));
});

app.post('/register', async (c) => {
	const jwt = await loginService.register(c, await c.req.json());
	return c.json(result.ok(jwt));
});

app.delete('/logout', async (c) => {
	await loginService.logout(c, userContext.getUserId(c));
	return c.json(result.ok());
});

app.get('/login/webauthn/options', async (c) => {
	const options = await passkeyService.generateAuthOptions(c);
	return c.json(result.ok(options));
});

app.post('/login/webauthn/verify', async (c) => {
	const token = await passkeyService.verifyAuth(c, await c.req.json());
	return c.json(result.ok({ token: token }));
});

