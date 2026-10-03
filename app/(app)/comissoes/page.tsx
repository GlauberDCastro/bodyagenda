import { redirect } from "next/navigation";

/** Endereço antigo: "Comissões" passou a se chamar "Bonificações". */
export default async function ComissoesPage(props: {
  searchParams: Promise<Record<string, string>>;
}) {
  const q = new URLSearchParams(await props.searchParams);
  redirect(`/bonificacoes${q.size ? `?${q}` : ""}`);
}
