import { getPortfolioList } from "./data";
import PortfolioSidebar from "./PortfolioSidebar";

export default async function PortfoliosLayout({ children }: { children: React.ReactNode }) {
  const portfolios = await getPortfolioList();

  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <PortfolioSidebar portfolios={portfolios} />
      <div className="min-w-0 flex-1 px-4 py-6 sm:px-8">
        <div className="mx-auto max-w-6xl space-y-6">{children}</div>
      </div>
    </div>
  );
}
