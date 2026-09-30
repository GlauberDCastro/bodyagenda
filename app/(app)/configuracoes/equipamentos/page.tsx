import { listarEquipamentos, listarSalas, agruparPorModelo } from "@/lib/consultas/recursos";
import { AvisoBanco, Etiqueta, Vazio } from "@/components/ui/primitivos";
import { FormularioEquipamento } from "./formulario-equipamento";
import { BotaoDuplicar } from "./botao-duplicar";

export const metadata = { title: "Equipamentos" };

export default async function EquipamentosPage() {
  const [equipamentos, salas] = await Promise.all([listarEquipamentos(), listarSalas()]);

  if (equipamentos.semSchema) return <AvisoBanco />;
  if (equipamentos.erro) {
    return (
      <p className="text-sm text-[color:var(--status-critico)]">
        Erro ao carregar equipamentos: {equipamentos.erro}
      </p>
    );
  }

  const modelos = agruparPorModelo(equipamentos.dados);
  const nomeSala = (id: string | null) => {
    const s = salas.dados.find((x) => x.id === id);
    return s ? `Sala ${s.numero}` : "—";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-[var(--tinta-3)]">
          {equipamentos.dados.filter((e) => e.ativo).length} unidade(s) ativa(s) em {modelos.length}{" "}
          modelo(s)
        </p>
        <FormularioEquipamento salas={salas.dados} />
      </div>

      {equipamentos.dados.length === 0 ? (
        <Vazio>
          Nenhum equipamento cadastrado. Rode <code>npm run db:reset</code> para carregar o parque
          do Anexo A.
        </Vazio>
      ) : (
        <div className="space-y-6">
          {modelos.map(({ modelo, unidades, ativas }) => (
            <section key={modelo} className="space-y-2">
              <div className="flex items-baseline gap-2">
                <h2 className="text-sm font-semibold">{modelo}</h2>
                <span className="text-xs text-[var(--tinta-3)]">
                  {ativas} unidade{ativas === 1 ? "" : "s"}
                </span>
                {ativas === 1 && (
                  <span
                    className="text-xs text-[color:var(--status-atencao)]"
                    title="Unidade única: todo procedimento que usa este modelo disputa o mesmo aparelho."
                  >
                    · unidade única
                  </span>
                )}
              </div>

              <div className="overflow-x-auto rounded-lg border border-[var(--traco)]">
                <table className="w-full text-sm">
                  <thead className="border-b border-[var(--traco)] text-left ">
                    <tr className="text-[var(--tinta-3)]">
                      <th className="px-4 py-2.5 font-medium">Unidade</th>
                      <th className="px-4 py-2.5 font-medium">Série</th>
                      <th className="px-4 py-2.5 font-medium">Alocação</th>
                      <th className="px-4 py-2.5 font-medium">Sala</th>
                      <th className="px-4 py-2.5 font-medium">Vigência</th>
                      <th className="px-4 py-2.5 font-medium">Situação</th>
                      <th className="px-4 py-2.5 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {unidades.map((eq) => (
                      <tr key={eq.id} className="border-b border-[var(--traco)] last:border-0 ">
                        <td className="px-4 py-2.5 font-medium">{eq.nome}</td>
                        <td className="px-4 py-2.5 text-[var(--tinta-2)]">
                          {eq.numero_serie ?? "—"}
                        </td>
                        <td className="px-4 py-2.5">
                          <Etiqueta tom={eq.tipo_alocacao === "fixo" ? "atencao" : "neutro"}>
                            {eq.tipo_alocacao === "fixo" ? "Fixo" : "Móvel"}
                          </Etiqueta>
                        </td>
                        <td className="px-4 py-2.5 text-[var(--tinta-2)]">
                          {nomeSala(eq.sala_id)}
                        </td>
                        <td className="px-4 py-2.5 tabular-nums text-[var(--tinta-2)]">
                          {eq.vigencia_inicio}
                          {eq.vigencia_fim ? ` → ${eq.vigencia_fim}` : ""}
                        </td>
                        <td className="px-4 py-2.5">
                          <Etiqueta tom={eq.ativo ? "bom" : "neutro"}>
                            {eq.ativo ? "Ativo" : "Inativo"}
                          </Etiqueta>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <BotaoDuplicar id={eq.id} nome={eq.nome} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
