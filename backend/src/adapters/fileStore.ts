import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

export interface FileStore {
  put(key: string, data: Buffer): Promise<void>
  get(key: string): Promise<Buffer | null>
  delete(key: string): Promise<void>
}

// Demo: files on local disk. The pilot swaps in an S3-compatible bucket.
export class LocalFileStore implements FileStore {
  private readonly root: string

  constructor(root: string) {
    this.root = resolve(root)
  }

  async put(key: string, data: Buffer) {
    const path = this.pathFor(key)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, data)
  }

  async get(key: string) {
    try {
      return await readFile(this.pathFor(key))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
    }
  }

  async delete(key: string) {
    await rm(this.pathFor(key), { force: true })
  }

  private pathFor(key: string): string {
    const path = resolve(join(this.root, key))
    if (!path.startsWith(`${this.root}/`)) throw new Error('invalid file key')
    return path
  }
}
