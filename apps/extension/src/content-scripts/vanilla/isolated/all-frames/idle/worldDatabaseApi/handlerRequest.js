import { handlerTwApis } from "./handlerTwApis";

export async function handleRequest({ db, world, payload }) {
  switch (db) {
    case 'tw-apis':
      return await handlerTwApis({ world, payload });

    default:
      throw new Error('Not found');
  }
}
