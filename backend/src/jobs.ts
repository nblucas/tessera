import { PgBoss } from 'pg-boss'

export type JobName = 'issue-ticket' | 'reverse-payment'
export type JobData = {
  'issue-ticket': { orderId: string }
  'reverse-payment': { orderId: string; amountCents: number }
}
export type JobHandler<N extends JobName> = (data: JobData[N]) => Promise<void>

export interface Jobs {
  register<N extends JobName>(name: N, handler: JobHandler<N>): Promise<void>
  send<N extends JobName>(name: N, data: JobData[N]): Promise<void>
}

// Production: a Postgres-backed queue. A handler that throws is retried with growing delays.
export class PgBossJobs implements Jobs {
  private readonly boss: PgBoss

  constructor(connectionString: string) {
    this.boss = new PgBoss(connectionString)
  }

  async start() {
    await this.boss.start()
  }

  async stop() {
    await this.boss.stop()
  }

  async register<N extends JobName>(name: N, handler: JobHandler<N>) {
    await this.boss.createQueue(name)
    await this.boss.work<JobData[N]>(name, async (jobs) => {
      for (const job of jobs) await handler(job.data)
    })
  }

  async send<N extends JobName>(name: N, data: JobData[N]) {
    await this.boss.send(name, data, { retryLimit: 10, retryDelay: 5, retryBackoff: true })
  }
}

// Tests: runs each job right away. A failed job is kept so the test can retry it.
export class InlineJobs implements Jobs {
  private readonly handlers = new Map<JobName, JobHandler<JobName>>()
  readonly failed: { name: JobName; data: JobData[JobName]; error: unknown }[] = []

  async register<N extends JobName>(name: N, handler: JobHandler<N>) {
    this.handlers.set(name, handler as JobHandler<JobName>)
  }

  async send<N extends JobName>(name: N, data: JobData[N]) {
    try {
      await this.handlers.get(name)!(data)
    } catch (error) {
      this.failed.push({ name, data, error })
    }
  }

  async retryFailed() {
    const jobs = this.failed.splice(0)
    for (const job of jobs) await this.send(job.name, job.data)
  }
}
