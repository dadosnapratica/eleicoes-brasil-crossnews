import type { CandidateId } from "./types";

/** Official TSE / DivulgaCand 2026 presidential 2nd-round portraits. */
export const TSE_ELECTION_ID = "20322002026";
export const TSE_DIVULGA_HOME = "https://divulgacandcontas.tse.jus.br/divulga/#/home";
export const TSE_DIVULGA_BR =
  "https://divulgacandcontas.tse.jus.br/divulga/#/candidato/regiao/BR/20322002026";
export const TSE_DADOS_ABERTOS = "https://dadosabertos.tse.jus.br/dataset/candidatos-2026";
export const TSE_FOTO_ZIP =
  "https://cdn.tse.jus.br/estatistica/sead/eleicoes/eleicoes2026/fotos/foto_cand2026_BR_div.zip";

export const TSE_CANDIDATES: Partial<
  Record<
    CandidateId,
    {
      name: string;
      fullName: string;
      number: number;
      sqCand: string;
      src: string;
      pageUrl: string;
      fotoUrl: string;
      apiUrl: string;
    }
  >
> = {
  flavio_bolsonaro: {
    name: "Flávio Bolsonaro",
    fullName: "Flavio Nantes Bolsonaro",
    number: 22,
    sqCand: "280002551544",
    src: "/candidates/flavio-bolsonaro.jpg",
    pageUrl:
      "https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/BR/20322002026/candidato/280002551544",
    fotoUrl:
      "https://divulgacandcontas.tse.jus.br/divulga/rest/arquivo/img/20322002026/280002551544/BR",
    apiUrl:
      "https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/BR/20322002026/candidato/280002551544",
  },
  lula: {
    name: "Lula",
    fullName: "Luiz Inácio Lula da Silva",
    number: 13,
    sqCand: "280002542548",
    src: "/candidates/lula.jpg",
    pageUrl:
      "https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/BR/20322002026/candidato/280002542548",
    fotoUrl:
      "https://divulgacandcontas.tse.jus.br/divulga/rest/arquivo/img/20322002026/280002542548/BR",
    apiUrl:
      "https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/BR/20322002026/candidato/280002542548",
  },
};
