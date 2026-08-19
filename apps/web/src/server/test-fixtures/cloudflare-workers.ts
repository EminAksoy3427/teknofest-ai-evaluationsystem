export class WorkflowEntrypoint<Environment = unknown> {
  protected env: Environment;

  constructor(_context: ExecutionContext, environment: Environment) {
    this.env = environment;
  }
}
