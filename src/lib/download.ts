/**
 * 下载工具（浏览器端）
 */

/** 触发浏览器下载一个 Blob */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.rel = 'noopener'
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  // 立即 revoke 在部分浏览器会中断下载，延后释放
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** 触发下载一段文本（JSON 等） */
export function downloadText(text: string, fileName: string, mime = 'application/json'): void {
  downloadBlob(new Blob([text], { type: `${mime};charset=utf-8` }), fileName)
}

/** 触发下载一个 JSON 对象（带缩进，便于人工检查与版本管理） */
export function downloadJson(value: unknown, fileName: string): void {
  downloadText(JSON.stringify(value, null, 2), fileName)
}
