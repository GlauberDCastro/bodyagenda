import ExcelJS from "exceljs";
import { createServerSupabase } from "@/lib/supabase/server";
import { lerCsv } from "@/lib/importacao/pacientes";

/** Acima disso, a planilha provavelmente não é uma lista de pacientes. */
const TAMANHO_MAX = 5 * 1024 * 1024;
const LINHAS_MAX = 20_000;

/** Texto da célula do Excel. Data vira "aaaa-mm-dd"; fórmula, o resultado. */
function textoDaCelula(valor: ExcelJS.CellValue): string {
  if (valor === null || valor === undefined) return "";
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  if (typeof valor === "object") {
    if ("richText" in valor) return valor.richText.map((t) => t.text).join("");
    if ("text" in valor) return String(valor.text);
    if ("result" in valor) return textoDaCelula(valor.result as ExcelJS.CellValue);
    return "";
  }
  return String(valor);
}

/** CSV do Excel brasileiro costuma vir em Windows-1252, não UTF-8. */
function decodificar(bytes: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/**
 * Lê a planilha enviada e devolve as linhas como texto. Não grava nada: a
 * gravação passa pela revisão na tela e pela ação de importar.
 */
export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ erro: "Sessão expirada. Entre de novo." }, { status: 401 });

  const arquivo = (await request.formData()).get("arquivo");
  if (!(arquivo instanceof File))
    return Response.json({ erro: "Envie um arquivo." }, { status: 400 });
  if (arquivo.size > TAMANHO_MAX) {
    return Response.json({ erro: "Arquivo maior que 5 MB." }, { status: 413 });
  }

  const nome = arquivo.name.toLowerCase();
  const bytes = await arquivo.arrayBuffer();
  let linhas: string[][];
  try {
    if (nome.endsWith(".csv") || nome.endsWith(".txt")) {
      linhas = lerCsv(decodificar(bytes));
    } else if (nome.endsWith(".xlsx")) {
      const livro = new ExcelJS.Workbook();
      await livro.xlsx.load(bytes);
      const aba = livro.worksheets[0];
      linhas = [];
      aba?.eachRow({ includeEmpty: false }, (row) => {
        const valores = (row.values as ExcelJS.CellValue[]).slice(1); // índice 0 é vazio no exceljs
        linhas.push(valores.map(textoDaCelula));
      });
    } else {
      return Response.json(
        { erro: "Formato não aceito. Use .xlsx ou .csv (no Excel: Salvar como › CSV)." },
        { status: 415 },
      );
    }
  } catch {
    return Response.json(
      { erro: "Não consegui ler o arquivo. Ele está corrompido ou protegido por senha?" },
      { status: 422 },
    );
  }

  if (linhas.length < 2) {
    return Response.json(
      { erro: "A planilha precisa de um cabeçalho e ao menos uma linha." },
      { status: 422 },
    );
  }
  if (linhas.length > LINHAS_MAX + 1) {
    return Response.json(
      {
        erro: `Até ${LINHAS_MAX.toLocaleString("pt-BR")} pacientes por arquivo. Divida a planilha.`,
      },
      { status: 413 },
    );
  }
  return Response.json({ linhas });
}
