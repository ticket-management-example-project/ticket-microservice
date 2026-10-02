export class ConfirmTicketTriageCommand {
  constructor(
    public readonly ticketId: string,
    public readonly reviewedBy: string,
  ) {}
}
