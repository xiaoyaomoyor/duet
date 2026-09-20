import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { Blob as NodeBlob } from 'node:buffer'
import { createZip, readZip, crc32, ZIP_LIMIT } from './zip'
const original = globalThis.Blob
beforeAll(() => {
  globalThis.Blob = NodeBlob as typeof Blob
})
afterAll(() => {
  globalThis.Blob = original
})
describe('bounded ZIP32 delivery', () => {
  it('round trips UTF-8 content and binary bytes', async () => {
    const files = await readZip(
      await createZip([
        { name: 'project.duet', blob: new Blob(['评测']) },
        { name: 'media/000001.bin', blob: new Blob([new Uint8Array([0, 255, 3])]) },
      ]),
    )
    expect(await files.get('project.duet')!.text()).toBe('评测')
    expect([...new Uint8Array(await files.get('media/000001.bin')!.arrayBuffer())]).toEqual([
      0, 255, 3,
    ])
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
  })
  it('rejects corrupted data before returning any files', async () => {
    const zip = await createZip([{ name: 'x.bin', blob: new Blob(['binary']) }]),
      bytes = new Uint8Array(await zip.arrayBuffer())
    bytes[35] = bytes[35]! ^ 255
    await expect(readZip(new Blob([bytes]))).rejects.toThrow('校验失败')
  })
  it.each(['../project.duet', '/x', 'media/../../x', 'C:\\file', 'a//b'])(
    'rejects unsafe archive paths %s',
    async (name) => {
      await expect(createZip([{ name, blob: new Blob(['x']) }])).rejects.toThrow()
    },
  )
  it('rejects duplicates and size bombs before reading payloads', async () => {
    await expect(
      createZip([
        { name: 'x', blob: new Blob() },
        { name: 'x', blob: new Blob() },
      ]),
    ).rejects.toThrow()
    await expect(createZip([{ name: 'x', blob: { size: ZIP_LIMIT } as Blob }])).rejects.toThrow(
      '128 MiB',
    )
    await expect(readZip({ size: ZIP_LIMIT + 1 } as Blob)).rejects.toThrow('128 MiB')
  })
  it('rejects truncated archives and central/local inconsistencies', async () => {
    const b = new Uint8Array(
      await (await createZip([{ name: 'x', blob: new Blob(['ok']) }])).arrayBuffer(),
    )
    await expect(readZip(new Blob([b.subarray(0, b.length - 1)]))).rejects.toThrow()
    b[6] = 1
    await expect(readZip(new Blob([b]))).rejects.toThrow()
  })
})
