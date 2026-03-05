import app from '../hono/hono';
import userService from '../service/user-service';
import result from '../model/result';
import userContext from '../security/user-context';
import passkeyService from '../service/passkey-service';

app.get('/my/loginUserInfo', async (c) => {
	const user = await userService.loginUserInfo(c, userContext.getUserId(c));
	return c.json(result.ok(user));
});

app.put('/my/resetPassword', async (c) => {
	await userService.resetPassword(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok());
});

app.delete('/my/delete', async (c) => {
	await userService.delete(c, userContext.getUserId(c));
	return c.json(result.ok());
});

app.get('/my/webauthn/register/options', async (c) => {
	const options = await passkeyService.generateRegisterOptions(c, userContext.getUserId(c));
	return c.json(result.ok(options));
});

app.post('/my/webauthn/register/verify', async (c) => {
	const { challengeId, response } = await c.req.json();
	await passkeyService.verifyRegister(c, userContext.getUserId(c), challengeId, response);
	return c.json(result.ok());
});

app.get('/my/webauthn/list', async (c) => {
	const list = await passkeyService.listUserPasskeys(c, userContext.getUserId(c));
	return c.json(result.ok(list));
});

app.delete('/my/webauthn/:id', async (c) => {
	await passkeyService.deletePasskey(c, userContext.getUserId(c), c.req.param('id'));
	return c.json(result.ok());
});


