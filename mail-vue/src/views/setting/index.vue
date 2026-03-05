<template>
  <div class="box">
    <div class="container">
      <div class="title">{{$t('profile')}}</div>
      <div class="item">
        <div>{{$t('username')}}</div>
        <div>
          <span v-if="setNameShow" class="edit-name-input">
            <el-input v-model="accountName"  ></el-input>
            <span class="edit-name" @click="setName">
             {{$t('save')}}
            </span>
          </span>
          <span v-else class="user-name">
            <span >{{ userStore.user.name }}</span>
            <span class="edit-name" @click="showSetName">
             {{$t('change')}}
            </span>
          </span>
        </div>
      </div>
      <div class="item">
        <div>{{$t('emailAccount')}}</div>
        <div>{{ userStore.user.email }}</div>
      </div>
      <div class="item">
        <div>{{$t('password')}}</div>
        <div>
          <el-button type="primary" @click="pwdShow = true">{{$t('changePwdBtn')}}</el-button>
        </div>
      </div>
      <div class="item" v-if="settingStore.settings.passkeyEnabled">
        <div>{{$t('passkeys')}}</div>
        <div>
          <template v-if="passkeys.length === 0">
            <el-button type="primary" :loading="registerLoading" @click="handleRegisterPasskey">{{$t('registerPasskey')}}</el-button>
          </template>
          <template v-else>
            <div style="display: flex; align-items: center; gap: 12px;">
              <span style="font-family: monospace; font-size: 12px; color: var(--el-text-color-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 260px;">{{ passkeys[0].id }}</span>
              <el-button type="danger" size="small" @click="handleDeletePasskey(passkeys[0].id)">{{$t('delete')}}</el-button>
            </div>
            <div style="margin-top: 8px; font-size: 12px; color: var(--el-text-color-placeholder);">{{$t('passkeyRegistered')}}</div>
          </template>
        </div>
      </div>
    </div>
    <div class="del-email" v-perm="'my:delete'">
      <div class="title">{{$t('deleteUser')}}</div>
      <div style="color: var(--regular-text-color);">
        {{$t('delAccountMsg')}}
      </div>
      <div>
        <el-button type="primary" @click="deleteConfirm">{{$t('deleteUserBtn')}}</el-button>
      </div>
    </div>
    <el-dialog v-model="pwdShow" :title="$t('changePassword')" width="340">
      <div class="update-pwd">
        <el-input type="password" :placeholder="$t('newPassword')" v-model="form.password" autocomplete="off"/>
        <el-input type="password" :placeholder="$t('confirmPassword')" v-model="form.newPwd" autocomplete="off"/>
        <el-button type="primary" :loading="setPwdLoading" @click="submitPwd">{{$t('save')}}</el-button>
      </div>
    </el-dialog>
  </div>
</template>
<script setup>
import {reactive, ref, defineOptions, onMounted} from 'vue'
import {resetPassword, userDelete, getWebauthnRegisterOptions, verifyWebauthnRegister, getWebauthnList, deleteWebauthn} from "@/request/my.js";
import {startRegistration} from '@simplewebauthn/browser';
import {useUserStore} from "@/store/user.js";
import router from "@/router/index.js";
import {accountSetName} from "@/request/account.js";
import {useAccountStore} from "@/store/account.js";
import {useSettingStore} from "@/store/setting.js";
import {useI18n} from "vue-i18n";
import {ElMessageBox, ElMessage} from 'element-plus';

const { t } = useI18n()
const accountStore = useAccountStore()
const userStore = useUserStore();
const settingStore = useSettingStore();
const setPwdLoading = ref(false)
const setNameShow = ref(false)
const accountName = ref(null)

const passkeys = ref([])
const registerLoading = ref(false)

const loadPasskeys = async () => {
  try {
    const res = await getWebauthnList()
    passkeys.value = res || []
  } catch (err) {
    console.error(err)
  }
}

onMounted(() => {
  loadPasskeys()
})

const handleRegisterPasskey = async () => {
  registerLoading.value = true
  try {
    const options = await getWebauthnRegisterOptions()

    const registrationResp = await startRegistration(options)

    await verifyWebauthnRegister({
      challengeId: options.challengeId,
      response: registrationResp
    })

    ElMessage({
      message: t('passkeyRegSuccess'),
      type: 'success',
      plain: true,
    })
    
    loadPasskeys()
  } catch (err) {
    console.error(err)
    ElMessage({
      message: t('passkeyRegFailed'),
      type: 'error',
      plain: true,
    })
  } finally {
    registerLoading.value = false
  }
}

const handleDeletePasskey = (id) => {
  ElMessageBox.confirm(t('deletePasskeyConfirm'), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(async () => {
    try {
      await deleteWebauthn(id)
      ElMessage({
        message: t('deleteSuccess'),
        type: 'success',
        plain: true,
      })
      loadPasskeys()
    } catch (err) {
      console.error(err)
    }
  }).catch(() => {})
}

defineOptions({
  name: 'setting'
})

function showSetName() {
  accountName.value = userStore.user.name
  setNameShow.value = true
}

function setName() {

  if (!accountName.value) {
    ElMessage({
      message: t('emptyUserNameMsg'),
      type: 'error',
      plain: true,
    })
    return;
  }

  setNameShow.value = false
  let name = accountName.value

  if (name === userStore.user.name) {
    return
  }

  userStore.user.name = accountName.value

  accountSetName(userStore.user.account.accountId,name).then(() => {
    ElMessage({
      message: t('saveSuccessMsg'),
      type: 'success',
      plain: true,
    })

    accountStore.changeUserAccountName = name

  }).catch(() => {
    userStore.user.name = name
  })
}

const pwdShow = ref(false)
const form = reactive({
  password: '',
  newPwd: '',
})

const deleteConfirm = () => {
  ElMessageBox.confirm(t('delAccountConfirm'), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    userDelete().then(() => {
      localStorage.removeItem('token');
      router.replace('/login');
      ElMessage({
        message: t('delSuccessMsg'),
        type: 'success',
        plain: true,
      })
    })
  })
}


function submitPwd() {

  if (!form.password) {
    ElMessage({
      message: t('emptyPwdMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  if (form.password.length < 6) {
    ElMessage({
      message: t('pwdLengthMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  if (form.password !== form.newPwd) {
    ElMessage({
      message: t('confirmPwdFailMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  setPwdLoading.value = true
  resetPassword(form.password).then(() => {
    ElMessage({
      message: t('saveSuccessMsg'),
      type: 'success',
      plain: true,
    })
    pwdShow.value = false
    setPwdLoading.value = false
    form.password = ''
    form.newPwd = ''
  }).catch(() => {
    setPwdLoading.value = false
  })

}

</script>
<style scoped lang="scss">
.box {
  padding: 40px 40px;

  @media (max-width: 767px) {
    padding: 30px 30px;
  }

  .update-pwd {
    display: flex;
    flex-direction: column;
    gap: 15px;
  }

  .title {
    font-size: 18px;
    font-weight: bold;
  }

  .container {
    font-size: 14px;
    display: grid;
    gap: 20px;
    margin-bottom: 40px;

    .item {
      display: grid;
      grid-template-columns: 6em 1fr;
      gap: 4vw;
      position: relative;
      .user-name {
        display: grid;
        grid-template-columns: auto 1fr;
        span:first-child {
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
        }
      }

      .edit-name-input {
        position: absolute;
        bottom: -6px;
        .el-input {
          width: min(200px,calc(100vw - 222px));
        }
      }

      .edit-name {
        color: #4dabff;
        padding-left: 10px;
        cursor: pointer;
      }

      div:first-child {
        font-weight: bold;
        white-space: nowrap;
      }

      div:last-child {
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }
    }
  }

  .del-email {
    font-size: 14px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
}
</style>
