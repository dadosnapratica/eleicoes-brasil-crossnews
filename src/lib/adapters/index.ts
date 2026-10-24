import type { SourceAdapter } from "./types";
import { g1Adapter } from "./g1";
import { uolAdapter } from "./uol";
import { terraAdapter } from "./terra";
import { folhaAdapter } from "./folha";
import { estadaoAdapter } from "./estadao";
import { afpAdapter } from "./afp";
import { comprovaAdapter } from "./comprova";
import { secondaryAdapters } from "./secondary";

export const adapters: SourceAdapter[] = [
  g1Adapter,
  uolAdapter,
  terraAdapter,
  folhaAdapter,
  estadaoAdapter,
  afpAdapter,
  comprovaAdapter,
  ...secondaryAdapters,
];

export { g1Adapter, uolAdapter, terraAdapter, folhaAdapter };
export { estadaoAdapter, afpAdapter, comprovaAdapter };
export {
  G1_METHODOLOGY_URL,
  G1_ELEICOES_URL,
  G1_HOME_URL,
} from "./g1";
export { UOL_LIVE_URL, UOL_CONFERE_URL } from "./uol";
export { TERRA_ANNOUNCE_URL, AOS_FATOS_LIVE_URL } from "./terra";
export { FOLHA_ANNOUNCE_URL, FOLHA_LIVE_URL, LUPA_HOME_URL } from "./folha";
export { ESTADAO_LIVE_URL, ESTADAO_HOME_URL } from "./estadao";
export { AFP_HOME_URL, AFP_ELEICOES_URL } from "./afp";
export { COMPROVA_HOME_URL, COMPROVA_PLANTAO_URL } from "./comprova";
