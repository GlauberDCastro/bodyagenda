"use client";

import { useRouter } from "next/navigation";
import { SeletorData } from "./seletor-data";

/** Mini-calendário para páginas de servidor: escolher o dia troca o `?dia=` da URL. */
export function NavegarData({
  caminho,
  ...props
}: {
  caminho: string;
  dia: string;
  hoje: string;
  rotulo: string;
  diasAbertos: readonly number[];
}) {
  const router = useRouter();
  return (
    <SeletorData {...props} periodo="dia" aoEscolher={(d) => router.push(`${caminho}?dia=${d}`)} />
  );
}
