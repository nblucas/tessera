export interface Mailer {
  sendSignInCode(email: string, code: string): Promise<void>
}

// Demo: prints the code to the server log instead of sending an e-mail.
export class ConsoleMailer implements Mailer {
  async sendSignInCode(email: string, code: string): Promise<void> {
    console.info(`[mailer] sign-in code for ${email}: ${code}`)
  }
}
