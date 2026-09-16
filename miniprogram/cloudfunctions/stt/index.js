const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

function ok(data) {
  return { ok: true, data }
}

function fail(code, message) {
  return { ok: false, code, message }
}

function membershipId(openid, familyId) {
  return `${openid}_${familyId}`
}

async function resolveFamilyContext(openid) {
  const userSnap = await db.collection('users').doc(openid).get().catch(() => null)
  if (!userSnap || !userSnap.data) {
    return { error: fail('NO_FAMILY', '尚未加入家庭') }
  }
  const familyId = userSnap.data.currentFamilyId
  if (!familyId) {
    return { error: fail('NO_FAMILY', '尚未加入家庭') }
  }
  const mem = await db
    .collection('memberships')
    .doc(membershipId(openid, familyId))
    .get()
    .catch(() => null)
  if (!mem || !mem.data) {
    return { error: fail('NO_FAMILY', '尚未加入家庭') }
  }
  return { familyId, openid }
}

function parseAsrPayload(raw) {
  let data = raw
  for (let i = 0; i < 4; i++) {
    if (typeof data === 'string') {
      const s = data.trim()
      if (!s) return { text: '', error: '' }
      try {
        data = JSON.parse(s)
      } catch (e) {
        return { text: s, error: '' }
      }
      continue
    }
    if (data && typeof data === 'object' && data.data !== undefined && data.Response === undefined) {
      data = data.data
      continue
    }
    break
  }
  if (!data || typeof data !== 'object') return { text: '', error: '' }
  const nested = data.Response || data
  if (nested.Error && (nested.Error.Message || nested.Error.Code)) {
    return { text: '', error: String(nested.Error.Message || nested.Error.Code) }
  }
  const text = nested.Result
  return { text: typeof text === 'string' ? text.trim() : '', error: '' }
}

/** 接入文档 Action=SentenceRecognitionWX；简介：直接上传音频 SourceType=1。 */
async function recognize(audioBase64, format) {
  const voiceFormat = format === 'wav' ? 'wav' : 'mp3'
  const dataLen = Buffer.from(audioBase64, 'base64').length
  const result = await cloud.openapi({ convertCase: false }).serviceMarket.invokeService({
    service: 'wxa8386175898e12c9',
    api: 'SentenceASR',
    data: JSON.stringify({
      Action: 'SentenceRecognitionWX',
      EngSerViceType: '16k_zh',
      SourceType: 1,
      VoiceFormat: voiceFormat,
      Data: audioBase64,
      DataLen: dataLen,
      UsrAudioKey: `hs_${Date.now()}`
    }),
    client_msg_id: `hs_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  })
  const errCode = result && result.errCode
  const parsed = parseAsrPayload(result)
  if (errCode && Number(errCode) !== 0) {
    return { text: '', error: parsed.error || result.errMsg || '语音识别调用失败' }
  }
  return parsed
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) {
    return fail('UNAUTHORIZED', '未登录')
  }

  const ctx = await resolveFamilyContext(OPENID)
  if (ctx.error) return ctx.error

  const audioBase64 = String((event && event.audioBase64) || '').replace(/\s/g, '')
  const format = String((event && event.format) || 'mp3').toLowerCase()
  if (!audioBase64 || audioBase64.length < 80) {
    return fail('INVALID_AUDIO', '没听清，请再说一次或改用打字')
  }
  if (audioBase64.length > 2800000) {
    return fail('INVALID_AUDIO', '这段话有点长，短说一句或改用打字')
  }

  try {
    const asr = await recognize(audioBase64, format)
    if (asr.text) return ok({ text: asr.text })
    if (asr.error) return fail('ASR', asr.error)
    return fail('NO_STT', '没听清，请再说一次或改用打字')
  } catch (e) {
    console.error('stt failed', e && (e.errCode || e.errMsg || e.message))
    return fail('NO_STT', (e && (e.errMsg || e.message)) || '语音转文字暂时不可用，请手打文字')
  }
}
