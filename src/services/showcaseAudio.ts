/** 原创合成试听夹具，12 秒 PCM；无外部版权素材，不冒充任何工具的产出。 */
export function createShowcaseAudio(variant: 'a' | 'b'): Blob {
  const rate = 22050
  const seconds = 12
  const samples = rate * seconds
  const buffer = new ArrayBuffer(44 + samples * 2)
  const view = new DataView(buffer)
  const text = (offset: number, value: string): void => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i))
  }
  text(0, 'RIFF')
  view.setUint32(4, 36 + samples * 2, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, rate, true)
  view.setUint32(28, rate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  text(36, 'data')
  view.setUint32(40, samples * 2, true)
  const notes =
    variant === 'a' ? [174.614, 220, 261.626, 329.628] : [174.614, 261.626, 349.228, 440]
  for (let i = 0; i < samples; i++) {
    const time = i / rate
    const fade = Math.min(1, time / 1.1, (seconds - time) / 1.4)
    let value = 0
    for (const [index, hz] of notes.entries()) {
      const pulse = 0.55 + 0.45 * Math.sin(time * 0.75 + index)
      value += Math.sin(2 * Math.PI * hz * time) * pulse * 0.075
      value += Math.sin(2 * Math.PI * hz * 2.002 * time) * 0.012
    }
    const beat = time % 0.75
    const note = notes[Math.floor(time / 0.75) % notes.length]!
    value +=
      Math.sin(2 * Math.PI * note * (variant === 'a' ? 2 : 4) * time) * Math.exp(-beat * 8) * 0.085
    view.setInt16(44 + i * 2, Math.round(value * Math.max(0, fade) * 32767), true)
  }
  return new Blob([buffer], { type: 'audio/wav' })
}
