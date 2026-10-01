import { apagarMassa } from "./massa";

export default async function globalTeardown() {
  await apagarMassa();
}
