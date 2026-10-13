interface PageHeaderProps {
  title: string;
  description?: string;
  children?: React.ReactNode;
}

export function PageHeader({ title, description, children }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-page-title">{title}</h1>
        {description && (
          <p className="text-sm text-muted-foreground" data-testid="text-page-description">
            {description}
          </p>
        )}
      </div>
      {children && <div className="flex items-center gap-2 mt-4 sm:mt-0">{children}</div>}
    </div>
  );
}
