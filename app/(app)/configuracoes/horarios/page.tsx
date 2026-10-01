import { carregarHorarios } from "@/lib/consultas/horarios";
import { assinatura, padraoMaisComum, resumirHorario } from "@/lib/horarios";
import { LABEL_TIPO_RECURSO, MOTIVOS_BLOQUEIO, type TipoRecurso } from "@/lib/types/database";
import { Cabecalho, Etiqueta, Secao, Tabela, Td, Th, Tr, Vazio } from "@/components/ui/primitivos";
import { HorarioPadrao } from "./horario-padrao";
import { EditarHorario } from "./editar-horario";
import { NovoBloqueio, RemoverBloqueio } from "./bloqueios";

export const metadata = { title: "Horários e bloqueios" };

const dataHora = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});

const TIPOS: TipoRecurso[] = ["sala", "equipamento", "profissional"];
export default async function HorariosPage() {
  const { recursos, bloqueios, erro } = await carregarHorarios();

  if (erro) {
    return (
      <p className="text-sm text-[color:var(--status-critico)]">
        Erro ao carregar horários: {erro}
      </p>
    );
  }

  const padrao = padraoMaisComum(recursos.map((r) => r.janelas));
  const chavePadrao = assinatura(padrao);
  const ehPadrao = (r: (typeof recursos)[number]) => assinatura(r.janelas) === chavePadrao;
  const excecoes = recursos.filter((r) => !ehPadrao(r)).length;

  return (
    <div className="space-y-8">
      <Secao
        titulo="Horário padrão da clínica"
        descricao={`Hoje, ${recursos.length - excecoes} de ${recursos.length} recursos seguem: ${resumirHorario(padrao)}.`}
      >
        <HorarioPadrao
          padrao={padrao}
          recursos={recursos.map(({ tipo, id }) => ({ tipo, id }))}
          excecoes={excecoes}
        />
      </Secao>

      <Secao
        titulo="Horário por recurso"
        descricao="Para o recurso que atende em horário diferente do padrão: um profissional que só vem à tarde, uma sala que abre mais tarde."
      >
        {recursos.length === 0 ? (
          <Vazio>
            Nenhum recurso ativo. Cadastre salas, equipamentos e profissionais primeiro.
          </Vazio>
        ) : (
          <Tabela>
            <Cabecalho>
              <Th>Recurso</Th>
              <Th>Tipo</Th>
              <Th>Horário</Th>
              <Th>
                <span className="sr-only">Situação</span>
              </Th>
              <Th>
                <span className="sr-only">Ações</span>
              </Th>
            </Cabecalho>
            <tbody>
              {TIPOS.flatMap((tipo) =>
                recursos
                  .filter((r) => r.tipo === tipo)
                  .map((r) => (
                    <Tr key={r.id}>
                      <Td forte>{r.nome}</Td>
                      <Td>{LABEL_TIPO_RECURSO[r.tipo]}</Td>
                      <Td>{resumirHorario(r.janelas)}</Td>
                      <Td>
                        {r.janelas.length === 0 ? (
                          <Etiqueta tom="critico">Sem horário</Etiqueta>
                        ) : ehPadrao(r) ? (
                          <Etiqueta>Padrão</Etiqueta>
                        ) : (
                          <Etiqueta tom="marca">Próprio</Etiqueta>
                        )}
                      </Td>
                      <Td alinhar="right">
                        <EditarHorario recurso={r} padrao={padrao} />
                      </Td>
                    </Tr>
                  )),
              )}
            </tbody>
          </Tabela>
        )}
      </Secao>

      <Secao
        titulo="Bloqueios"
        descricao="Férias, folga e manutenção. No período, o recurso não aceita agendamento e a capacidade do painel desconta as horas."
        acao={<NovoBloqueio recursos={recursos} />}
      >
        {bloqueios.length === 0 ? (
          <Vazio>Nenhum bloqueio vigente ou futuro.</Vazio>
        ) : (
          <Tabela>
            <Cabecalho>
              <Th>Recurso</Th>
              <Th>Período</Th>
              <Th>Motivo</Th>
              <Th>Observação</Th>
              <Th>
                <span className="sr-only">Ações</span>
              </Th>
            </Cabecalho>
            <tbody>
              {bloqueios.map((b) => (
                <Tr key={b.id}>
                  <Td forte>{b.recursoNome}</Td>
                  <Td>
                    {dataHora.format(new Date(b.inicio))} → {dataHora.format(new Date(b.fim))}
                  </Td>
                  <Td>
                    <Etiqueta tom={b.motivo === "manutencao" ? "atencao" : "neutro"}>
                      {MOTIVOS_BLOQUEIO[b.motivo]}
                    </Etiqueta>
                  </Td>
                  <Td>{b.observacao ?? "—"}</Td>
                  <Td alinhar="right">
                    <RemoverBloqueio
                      id={b.id}
                      descricao={`${b.recursoNome}, ${MOTIVOS_BLOQUEIO[b.motivo]}`}
                    />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Tabela>
        )}
      </Secao>
    </div>
  );
}
