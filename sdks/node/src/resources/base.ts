/**
 * Base resource class
 */

export class Resource {
  protected client: any;

  constructor(client: any) {
    this.client = client;
  }
}
