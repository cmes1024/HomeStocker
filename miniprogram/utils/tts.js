/**
 * 管家回复朗读：请求 /api/voice/say 拿整段 WAV，用 WebAudio 播。
 *
 * 为什么不用 InnerAudioContext：它在 iOS 上对 wav 的兼容看系统版本；
 * 通话页那套 WebAudio 播放已经在真机跑通，这里沿用同一条路，只是不需要分块排程。
 *
 * 一次只播一条：新的 speak 会先停掉上一条，避免两段声音叠在一起。
 */
const { JAVA_BASE_URL } = require('./backendRoute')
const { getToken } = require('./javaApi')

let ctx = null
let source = null
let task = null
let seq = 0

function ensureCtx() {
  if (ctx) return ctx
  if (typeof wx.createWebAudioContext !== 'function') return null
  try {
    ctx = wx.createWebAudioContext()
  } catch (e) {
    ctx = null
  }
  return ctx
}

/** 停掉当前播放并作废在途请求；之后到达的响应会被丢弃 */
function stop() {
  seq += 1
  if (task) {
    try {
      task.abort()
    } catch (e) {
      // ignore
    }
    task = null
  }
  if (source) {
    try {
      source.stop()
    } catch (e) {
      // 已经播完的 source 再 stop 会抛，忽略
    }
    try {
      source.disconnect()
    } catch (e) {
      // ignore
    }
    source = null
  }
}

/** 只认 s16le；data 块偏移按 fmt 里声明的块对齐值算，不假设固定 44 字节头 */
function decodeWav(buffer) {
  const view = new DataView(buffer)
  if (view.byteLength < 44) return null
  let offset = 12
  let sampleRate = 0
  let channels = 1
  let bits = 16
  let dataOffset = -1
  let dataLen = 0
  while (offset + 8 <= view.byteLength) {
    let id = ''
    for (let i = 0; i < 4; i++) id += String.fromCharCode(view.getUint8(offset + i))
    const size = view.getUint32(offset + 4, true)
    if (id === 'fmt ') {
      channels = view.getUint16(offset + 10, true) || 1
      sampleRate = view.getUint32(offset + 12, true)
      bits = view.getUint16(offset + 22, true) || 16
    } else if (id === 'data') {
      dataOffset = offset + 8
      dataLen = Math.min(size, view.byteLength - dataOffset)
      break
    }
    offset += 8 + size + (size & 1)
  }
  if (dataOffset < 0 || !sampleRate || bits !== 16) return null
  const frames = Math.floor(dataLen / 2 / channels)
  if (!frames) return null
  const samples = new Float32Array(frames)
  for (let i = 0; i < frames; i++) {
    samples[i] = view.getInt16(dataOffset + i * 2 * channels, true) / 32768
  }
  return { samples, sampleRate }
}

/** 线性插值重采样到设备采样率，整段一次算完，不需要跨块保持相位 */
function resample(input, srcRate, dstRate) {
  if (!srcRate || !dstRate || srcRate === dstRate) return input
  const ratio = srcRate / dstRate
  const outLen = Math.floor(input.length / ratio)
  if (outLen <= 0) return new Float32Array(0)
  const out = new Float32Array(outLen)
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio
    const idx = Math.floor(pos)
    const frac = pos - idx
    const next = idx + 1 < input.length ? input[idx + 1] : input[idx]
    out[i] = input[idx] * (1 - frac) + next * frac
  }
  return out
}

/** WebAudio 不可用时的退路：写临时文件交给 InnerAudioContext */
function playByFile(buffer, onEnd) {
  return new Promise((resolve) => {
    try {
      const path = `${wx.env.USER_DATA_PATH}/hs-tts.wav`
      wx.getFileSystemManager().writeFileSync(path, buffer, 'binary')
      const audio = wx.createInnerAudioContext()
      audio.src = path
      audio.onEnded(() => {
        audio.destroy()
        if (onEnd) onEnd()
        resolve(true)
      })
      audio.onError(() => {
        audio.destroy()
        if (onEnd) onEnd()
        resolve(false)
      })
      audio.play()
    } catch (e) {
      resolve(false)
    }
  })
}

function playBuffer(buffer, onEnd) {
  const audio = decodeWav(buffer)
  const c = audio ? ensureCtx() : null
  if (!audio || !c) return playByFile(buffer, onEnd)
  if (c.state === 'suspended' && c.resume) {
    try {
      c.resume()
    } catch (e) {
      // ignore
    }
  }
  const rate = c.sampleRate || audio.sampleRate
  const samples = resample(audio.samples, audio.sampleRate, rate)
  if (!samples.length) return Promise.resolve(false)

  const ab = c.createBuffer(1, samples.length, rate)
  const channel = ab.getChannelData(0)
  if (channel.set) {
    channel.set(samples)
  } else {
    for (let i = 0; i < samples.length; i++) channel[i] = samples[i]
  }
  const src = c.createBufferSource()
  src.buffer = ab
  src.connect(c.destination)
  // stop() 也会触发 onended，页面据此把「停止」按钮复位
  src.onended = () => {
    if (onEnd) onEnd()
  }
  src.start(0)
  source = src
  return Promise.resolve(true)
}

/**
 * 朗读一段话。
 *
 * @param {object} options {kind, text, facts, voice}
 *   kind: answer | confirm | receipt
 *   facts: [{name, quantity, unit, spaceName, ok, names}]
 * @returns {Promise<boolean>} 是否真的播出来了
 */
function speak(options) {
  const opts = options || {}
  const text = String(opts.text || '').trim()
  const facts = Array.isArray(opts.facts) ? opts.facts : []
  if (!text && !facts.length) return Promise.resolve(false)

  stop()
  const my = seq
  let ended = false
  const finish = () => {
    if (ended) return
    ended = true
    if (typeof opts.onEnd === 'function') opts.onEnd()
  }

  return new Promise((resolve) => {
    const req = wx.request({
      url: `${JAVA_BASE_URL}/api/voice/say`,
      method: 'POST',
      header: {
        'Content-Type': 'application/json',
        'X-HS-Token': getToken() || ''
      },
      data: {
        kind: opts.kind || 'answer',
        text,
        facts,
        voice: opts.voice || ''
      },
      responseType: 'arraybuffer',
      // 服务端一次合成最多 150 字，合成耗时随长度增长，留足余量
      timeout: 30000,
      success: (res) => {
        if (my !== seq) {
          resolve(false)
          return
        }
        task = null
        if (res.statusCode !== 200 || !res.data) {
          finish()
          resolve(false)
          return
        }
        Promise.resolve(playBuffer(res.data, finish)).then(resolve, () => resolve(false))
      },
      fail: () => {
        if (my === seq) task = null
        finish()
        resolve(false)
      }
    })
    task = req
  })
}

module.exports = { speak, stop }
