import app from './hono/webs';
import { email } from './email/email';
import userService from './service/user-service';
import verifyRecordService from './service/verify-record-service';
import emailService from './service/email-service';
import kvObjService from './service/kv-obj-service';
import oauthService from "./service/oauth-service";
import KvConst from './const/kv-const';
export default {
	 async fetch(req, env, ctx) {

		const url = new URL(req.url)

		if (url.pathname.startsWith('/api/')) {
			url.pathname = url.pathname.replace('/api', '')
			req = new Request(url.toString(), req)
			return app.fetch(req, env, ctx);
		}

		 if (['/static/','/attachments/'].some(p => url.pathname.startsWith(p))) {
			 return await kvObjService.toObjResp( { env }, url.pathname.substring(1));
		 }

		 if (url.pathname === '/manifest.webmanifest') {
			try {
				const [setting, assetResponse] = await Promise.all([
					env.kv.get(KvConst.SETTING, { type: 'json' }),
					env.assets.fetch(req)
				]);
				if (!assetResponse.ok) {
					return assetResponse;
				}
				const title = setting?.title || 'Cloud Mail';
				const manifest = await assetResponse.json();
				manifest.name = title;
				manifest.short_name = title;
				return new Response(JSON.stringify(manifest), {
					headers: { 'Content-Type': 'application/manifest+json' },
				});
			} catch (e) {
				return env.assets.fetch(req);
			}
		}
		const assetResponse = await env.assets.fetch(req);
		const contentType = assetResponse.headers.get('content-type') || '';
		if (contentType.includes('text/html')) {
			try {
				const [setting, html] = await Promise.all([
    					env.kv.get(KvConst.SETTING, { type: 'json' }),
    					assetResponse.text()
				]);
				const title = setting?.title || 'Cloud Mail';
				const titleHtml = html.replace('<title>Cloud Mail</title>', `<title>${title}</title>`);
				return new Response(titleHtml, {
					status: assetResponse.status,
					headers: assetResponse.headers,
				});
			} catch (e) {
				return assetResponse;
			}
		}
		return assetResponse;
	},
	email: email,
	async scheduled(c, env, ctx) {
		await verifyRecordService.clearRecord({ env })
		await userService.resetDaySendCount({ env })
		await emailService.completeReceiveAll({ env })
		await oauthService.clearNoBindOathUser({ env })
	},
};
