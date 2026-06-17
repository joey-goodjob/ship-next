import { getTranslations } from "next-intl/server";

type ComparisonRow = {
  label: string;
  values: string[];
};

export async function Comparison() {
  const t = await getTranslations("landing");
  const columns = t.raw("comparison.columns") as string[];
  const rows = t.raw("comparison.rows") as ComparisonRow[];

  return (
    <section className="bg-brand-soft px-5 py-[70px] text-brand-ink lg:py-[120px]">
      <div className="mx-auto max-w-[1180px]">
        <h2 className="text-center text-xl font-bold leading-[25px] lg:text-4xl lg:leading-10">
          {t("comparison.title")}
        </h2>
        <div className="mt-10 overflow-x-auto rounded-md border border-brand-line bg-brand-panel">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-brand-line bg-brand-panel-strong">
                <th className="w-[190px] px-4 py-4 font-semibold leading-5 text-brand-ink" />
                {columns.map((col) => (
                  <th
                    key={col}
                    className="px-4 py-4 font-semibold leading-5 text-brand-ink"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.label}
                  className="border-b border-brand-line last:border-b-0"
                >
                  <th className="px-4 py-4 align-top font-semibold leading-5 text-brand-ink">
                    {row.label}
                  </th>
                  {row.values.map((value, i) => (
                    <td
                      key={`${row.label}-${columns[i]}`}
                      className="px-4 py-4 align-top leading-6 text-brand-muted"
                    >
                      {value}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-5 text-center text-sm font-normal leading-6 text-brand-muted lg:text-base lg:leading-7">
          {t("comparison.note")}
        </p>
      </div>
    </section>
  );
}
