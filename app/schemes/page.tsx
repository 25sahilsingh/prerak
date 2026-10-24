import { listSchemes } from "@/lib/db";
import { SchemeCatalogue } from "./SchemeCatalogue";

export const dynamic = "force-dynamic";

export default function SchemesPage() {
  const schemes = listSchemes().map(({ id, name, state, category, status, aka, benefit, applies_to }) => ({
    id,
    name,
    state,
    category,
    status,
    aka,
    benefit,
    applies_to,
  }));
  return <SchemeCatalogue schemes={schemes} />;
}
