import ExcelJS from "exceljs";
import type { Planilha, TipoColuna } from "./formato";

const FORMATO: Partial<Record<TipoColuna, string>> = {
  moeda: '"R$" #,##0.00',
  pct: "0.0%",
  numero: "#,##0.##",
  data: "dd/mm/yyyy",
};

/** XLSX de verdade: números como números, moeda e % formatados, cabeçalho fixo. */
export async function gerarXlsx(p: Planilha): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "hellodoctor · Performance Clínica";
  // Nome de aba: até 31 caracteres e sem os símbolos que o Excel recusa.
  const ws = wb.addWorksheet(p.titulo.replace(/[\\/?*[\]:]/g, " ").slice(0, 31));

  ws.columns = p.colunas.map((c) => ({
    header: c.rotulo,
    key: c.chave,
    width: Math.max(12, c.rotulo.length + 2),
    style: FORMATO[c.tipo ?? "texto"] ? { numFmt: FORMATO[c.tipo ?? "texto"] } : {},
  }));
  for (const l of p.linhas) {
    ws.addRow(
      Object.fromEntries(
        p.colunas.map((c) => {
          const v = l[c.chave];
          if (v === null || v === undefined || v === "") return [c.chave, null];
          if (c.tipo === "data") return [c.chave, new Date(`${String(v).slice(0, 10)}T12:00:00Z`)];
          if (c.tipo && c.tipo !== "texto") return [c.chave, Number(v)];
          return [c.chave, v];
        }),
      ),
    );
  }
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}
