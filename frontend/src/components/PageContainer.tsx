/** Same gutters and width as the watchlist/portfolio content area, for pages without a sidebar. */
export default function PageContainer({ title, actions, children }: {
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 flex-1 px-4 py-6 sm:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold">{title}</h1>
          {actions}
        </div>
        {children}
      </div>
    </div>
  );
}
