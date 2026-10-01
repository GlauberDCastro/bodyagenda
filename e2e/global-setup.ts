import { apagarMassa, criarMassa } from "./massa";

export default async function globalSetup() {
  // Sobra de uma execução interrompida não pode contaminar esta.
  await apagarMassa();
  await criarMassa();
}
