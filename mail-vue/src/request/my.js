import http from '@/axios/index.js';

export function loginUserInfo() {
    return http.get('/my/loginUserInfo')
}

export function resetPassword(password) {
    return http.put('/my/resetPassword', {password})
}

export function userDelete() {
    return http.delete('/my/delete')
}

export function getWebauthnRegisterOptions() {
    return http.get('/my/webauthn/register/options')
}

export function verifyWebauthnRegister(data) {
    return http.post('/my/webauthn/register/verify', data)
}

export function getWebauthnList() {
    return http.get('/my/webauthn/list')
}

export function deleteWebauthn(id) {
    return http.delete(`/my/webauthn/${encodeURIComponent(id)}`)
}

