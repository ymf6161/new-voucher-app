import { useEffect, useMemo, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Search, ChevronUp, ChevronDown, ChevronsUpDown, Filter, X } from "lucide-react";
import { cn } from "@/lib/utils";

type CellValue = string | number | null | undefined;

export interface Column<T> {
  key: keyof T | string;
  header: string;
  render?: (item: T) => React.ReactNode;
  /** Plain value used for sorting and searching. Defaults to item[key]. */
  value?: (item: T) => CellValue;
  /** Columns sort by default; set false to opt out. */
  sortable?: boolean;
  className?: string;
}

export type FilterDef<T> =
  | { key: string; label: string; type: "select"; value: (item: T) => string | null | undefined }
  | { key: string; label: string; type: "dateRange"; value: (item: T) => Date | string | null | undefined }
  | { key: string; label: string; type: "numberRange"; value: (item: T) => number | null | undefined };

type FilterState = Record<string, string[] | { from?: string; to?: string }>;

interface DataTableProps<T extends { id: string }> {
  data: T[];
  columns: Column<T>[];
  selectable?: boolean;
  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
  searchable?: boolean;
  searchPlaceholder?: string;
  /** Extra raw fields to search beyond the visible columns. */
  searchFields?: (keyof T)[];
  filters?: FilterDef<T>[];
  /** When set, search/sort/filters are kept in the URL under this prefix. */
  urlStateKey?: string;
  /** Rendered under the table for the currently visible (filtered) rows. */
  summary?: (rows: T[]) => React.ReactNode;
  /** Rendered next to the search box; receives the currently visible rows. */
  toolbar?: (rows: T[]) => React.ReactNode;
  emptyMessage?: string;
  isLoading?: boolean;
  actions?: (item: T) => React.ReactNode;
}

function rawValue<T>(item: T, column: Column<T>): CellValue {
  if (column.value) return column.value(item);
  const value = (item as any)[column.key];
  return typeof value === "object" ? undefined : value;
}

function searchText(value: CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return `${value} ${value.toFixed(2)}`;
  return value.toLowerCase();
}

function compareValues(a: CellValue, b: CellValue): number {
  const aEmpty = a === null || a === undefined || a === "";
  const bEmpty = b === null || b === undefined || b === "";
  if (aEmpty || bEmpty) return aEmpty === bEmpty ? 0 : aEmpty ? 1 : -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

function toDay(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = typeof value === "string" ? new Date(value) : value;
  if (isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function isActive(state: FilterState[string] | undefined): boolean {
  if (!state) return false;
  if (Array.isArray(state)) return state.length > 0;
  return Boolean(state.from || state.to);
}

function readUrlState(prefix?: string) {
  if (!prefix || typeof window === "undefined") return { q: "", sort: null, dir: "asc" as const, filters: {} };
  const params = new URLSearchParams(window.location.search);
  const filters: FilterState = {};
  params.forEach((value, key) => {
    if (!key.startsWith(`${prefix}.f.`)) return;
    const filterKey = key.slice(`${prefix}.f.`.length);
    if (value.includes("..")) {
      const [from, to] = value.split("..");
      filters[filterKey] = { from: from || undefined, to: to || undefined };
    } else {
      filters[filterKey] = value.split("|").filter(Boolean);
    }
  });
  return {
    q: params.get(`${prefix}.q`) || "",
    sort: params.get(`${prefix}.sort`),
    dir: (params.get(`${prefix}.dir`) === "desc" ? "desc" : "asc") as "asc" | "desc",
    filters,
  };
}

export function DataTable<T extends { id: string }>({
  data,
  columns,
  selectable = false,
  selectedIds = [],
  onSelectionChange,
  searchable = true,
  searchPlaceholder = "Search...",
  searchFields,
  filters = [],
  urlStateKey,
  summary,
  toolbar,
  emptyMessage = "No data found",
  isLoading = false,
  actions,
}: DataTableProps<T>) {
  const [initial] = useState(() => readUrlState(urlStateKey));
  const [searchQuery, setSearchQuery] = useState<string>(initial.q);
  const [sortKey, setSortKey] = useState<string | null>(initial.sort);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">(initial.dir);
  const [filterState, setFilterState] = useState<FilterState>(initial.filters);

  useEffect(() => {
    if (!urlStateKey) return;
    const params = new URLSearchParams(window.location.search);
    Array.from(params.keys())
      .filter((key) => key.startsWith(`${urlStateKey}.`))
      .forEach((key) => params.delete(key));
    if (searchQuery) params.set(`${urlStateKey}.q`, searchQuery);
    if (sortKey) {
      params.set(`${urlStateKey}.sort`, sortKey);
      params.set(`${urlStateKey}.dir`, sortOrder);
    }
    Object.entries(filterState).forEach(([key, state]) => {
      if (!isActive(state)) return;
      params.set(
        `${urlStateKey}.f.${key}`,
        Array.isArray(state) ? state.join("|") : `${state.from || ""}..${state.to || ""}`,
      );
    });
    const query = params.toString();
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
  }, [urlStateKey, searchQuery, sortKey, sortOrder, filterState]);

  const filteredData = useMemo(() => {
    const tokens = searchable ? searchQuery.toLowerCase().split(/\s+/).filter(Boolean) : [];
    return data.filter((item) => {
      for (const filter of filters) {
        const state = filterState[filter.key];
        if (!isActive(state)) continue;
        if (filter.type === "select") {
          if (!(state as string[]).includes(filter.value(item) ?? "")) return false;
        } else if (filter.type === "dateRange") {
          const { from, to } = state as { from?: string; to?: string };
          const day = toDay(filter.value(item));
          if (!day || (from && day < from) || (to && day > to)) return false;
        } else {
          const { from, to } = state as { from?: string; to?: string };
          const value = filter.value(item);
          if (value === null || value === undefined) return false;
          if (from && value < parseFloat(from)) return false;
          if (to && value > parseFloat(to)) return false;
        }
      }
      if (tokens.length === 0) return true;
      const haystack = [
        ...columns.map((column) => searchText(rawValue(item, column))),
        ...(searchFields || []).map((field) => searchText((item as any)[field])),
      ].join(" ");
      return tokens.every((token) => haystack.includes(token));
    });
  }, [data, filters, filterState, searchable, searchQuery, columns, searchFields]);

  const sortedData = useMemo(() => {
    const column = columns.find((c) => String(c.key) === sortKey);
    if (!column) return filteredData;
    return [...filteredData].sort((a, b) => {
      const comparison = compareValues(rawValue(a, column), rawValue(b, column));
      return sortOrder === "asc" ? comparison : -comparison;
    });
  }, [filteredData, columns, sortKey, sortOrder]);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortOrder("asc");
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (onSelectionChange) {
      onSelectionChange(checked ? sortedData.map((item) => item.id) : []);
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    if (onSelectionChange) {
      onSelectionChange(
        checked
          ? [...selectedIds, id]
          : selectedIds.filter((selectedId) => selectedId !== id)
      );
    }
  };

  const setFilter = (key: string, state: FilterState[string] | undefined) => {
    setFilterState((prev) => {
      const next = { ...prev };
      if (state && isActive(state)) next[key] = state;
      else delete next[key];
      return next;
    });
  };

  const activeFilters = filters.filter((filter) => isActive(filterState[filter.key]));
  const hasAnyCriteria = activeFilters.length > 0 || Boolean(searchQuery);

  const allSelected = sortedData.length > 0 && sortedData.every((item) => selectedIds.includes(item.id));
  const someSelected = selectedIds.length > 0 && !allSelected;

  const toolbarRow = (disabled: boolean) => (
    <div className="flex flex-wrap items-center gap-2">
      {searchable && (
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={searchPlaceholder}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            disabled={disabled}
            data-testid="input-search"
          />
        </div>
      )}
      {filters.map((filter) => (
        <FilterControl
          key={filter.key}
          filter={filter}
          data={data}
          state={filterState[filter.key]}
          onChange={(state) => setFilter(filter.key, state)}
          disabled={disabled}
        />
      ))}
      {hasAnyCriteria && !disabled && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setSearchQuery("");
            setFilterState({});
          }}
          data-testid="button-clear-filters"
        >
          Clear all
        </Button>
      )}
      {toolbar && <div className="ml-auto flex items-center gap-2">{toolbar(sortedData)}</div>}
    </div>
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        {toolbarRow(true)}
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                {selectable && <TableHead className="w-12" />}
                {columns.map((column) => (
                  <TableHead key={String(column.key)} className={column.className}>
                    {column.header}
                  </TableHead>
                ))}
                {actions && <TableHead className="w-24">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...Array(5)].map((_, i) => (
                <TableRow key={i}>
                  {selectable && <TableCell><div className="h-4 w-4 bg-muted rounded animate-pulse" /></TableCell>}
                  {columns.map((column) => (
                    <TableCell key={String(column.key)}>
                      <div className="h-4 bg-muted rounded animate-pulse" style={{ width: `${60 + ((i * 17) % 40)}%` }} />
                    </TableCell>
                  ))}
                  {actions && <TableCell><div className="h-8 w-20 bg-muted rounded animate-pulse" /></TableCell>}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {toolbarRow(false)}
      {activeFilters.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" data-testid="active-filters">
          {activeFilters.map((filter) => (
            <Badge key={filter.key} variant="secondary" className="gap-1 pr-1">
              {filter.label}: {describeFilter(filterState[filter.key]!)}
              <button
                type="button"
                className="rounded-sm p-0.5 hover:bg-muted"
                onClick={() => setFilter(filter.key, undefined)}
                aria-label={`Remove ${filter.label} filter`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {selectable && (
                <TableHead className="w-12">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={handleSelectAll}
                    aria-label="Select all"
                    data-testid="checkbox-select-all"
                    className={cn(someSelected && "data-[state=checked]:bg-primary/50")}
                  />
                </TableHead>
              )}
              {columns.map((column) => {
                const sortable = column.sortable !== false;
                const isSorted = sortKey === String(column.key);
                return (
                  <TableHead
                    key={String(column.key)}
                    className={cn(column.className, sortable && "cursor-pointer select-none")}
                    onClick={sortable ? () => handleSort(String(column.key)) : undefined}
                    aria-sort={isSorted ? (sortOrder === "asc" ? "ascending" : "descending") : undefined}
                  >
                    <div className={cn("flex items-center gap-1", column.className?.includes("text-right") && "justify-end")}>
                      {column.header}
                      {sortable && (
                        isSorted ? (
                          sortOrder === "asc" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronsUpDown className="h-3 w-3 opacity-40" />
                        )
                      )}
                    </div>
                  </TableHead>
                );
              })}
              {actions && <TableHead className="w-24 text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedData.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length + (selectable ? 1 : 0) + (actions ? 1 : 0)}
                  className="h-24 text-center text-muted-foreground"
                >
                  {hasAnyCriteria && data.length > 0 ? "No rows match the current search and filters" : emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              sortedData.map((item) => (
                <TableRow
                  key={item.id}
                  data-testid={`row-${item.id}`}
                  className={cn(
                    selectedIds.includes(item.id) && "bg-accent/50"
                  )}
                >
                  {selectable && (
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.includes(item.id)}
                        onCheckedChange={(checked) =>
                          handleSelectOne(item.id, checked as boolean)
                        }
                        aria-label={`Select row ${item.id}`}
                        data-testid={`checkbox-${item.id}`}
                      />
                    </TableCell>
                  )}
                  {columns.map((column) => (
                    <TableCell key={String(column.key)} className={column.className}>
                      {column.render
                        ? column.render(item)
                        : String(item[column.key as keyof T] ?? "")}
                    </TableCell>
                  ))}
                  {actions && (
                    <TableCell className="text-right">
                      {actions(item)}
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span data-testid="text-row-count">
          {sortedData.length === data.length
            ? `${data.length} row(s)`
            : `${sortedData.length} of ${data.length} row(s)`}
          {selectable && selectedIds.length > 0 && (
            <span data-testid="text-selected-count"> · {selectedIds.length} selected</span>
          )}
        </span>
        {summary && sortedData.length > 0 && <div className="font-medium text-foreground">{summary(sortedData)}</div>}
      </div>
    </div>
  );
}

function describeFilter(state: FilterState[string]): string {
  if (Array.isArray(state)) {
    return state.length <= 2 ? state.map((v) => v || "(none)").join(", ") : `${state.length} selected`;
  }
  if (state.from && state.to) return `${state.from} – ${state.to}`;
  if (state.from) return `from ${state.from}`;
  return `up to ${state.to}`;
}

function FilterControl<T>({
  filter,
  data,
  state,
  onChange,
  disabled,
}: {
  filter: FilterDef<T>;
  data: T[];
  state: FilterState[string] | undefined;
  onChange: (state: FilterState[string] | undefined) => void;
  disabled: boolean;
}) {
  const active = isActive(state);

  const options = useMemo(() => {
    if (filter.type !== "select") return [];
    const counts = new Map<string, number>();
    data.forEach((item) => {
      const value = filter.value(item) ?? "";
      counts.set(value, (counts.get(value) || 0) + 1);
    });
    return Array.from(counts.entries()).sort((a, b) =>
      a[0].localeCompare(b[0], undefined, { numeric: true, sensitivity: "base" }),
    );
  }, [filter, data]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant={active ? "secondary" : "outline"}
          size="sm"
          className="h-9"
          disabled={disabled}
          data-testid={`button-filter-${filter.key}`}
        >
          <Filter className="h-3.5 w-3.5 mr-1.5" />
          {filter.label}
          {active && Array.isArray(state) && <span className="ml-1">({state.length})</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-3">
        {filter.type === "select" ? (
          <div className="space-y-2">
            <div className="max-h-64 space-y-1 overflow-y-auto">
              {options.map(([value, count]) => {
                const selected = Array.isArray(state) && state.includes(value);
                return (
                  <label key={value || "__none"} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted">
                    <Checkbox
                      checked={selected}
                      onCheckedChange={(checked) => {
                        const current = Array.isArray(state) ? state : [];
                        onChange(checked ? [...current, value] : current.filter((v) => v !== value));
                      }}
                    />
                    <span className="flex-1 truncate">{value || "(none)"}</span>
                    <span className="text-xs text-muted-foreground">{count}</span>
                  </label>
                );
              })}
              {options.length === 0 && <p className="text-sm text-muted-foreground">No values</p>}
            </div>
            {active && (
              <Button variant="ghost" size="sm" className="w-full" onClick={() => onChange(undefined)}>
                Clear
              </Button>
            )}
          </div>
        ) : (
          <RangeInputs
            type={filter.type === "dateRange" ? "date" : "number"}
            state={Array.isArray(state) ? undefined : state}
            onChange={onChange}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}

function RangeInputs({
  type,
  state,
  onChange,
}: {
  type: "date" | "number";
  state: { from?: string; to?: string } | undefined;
  onChange: (state: { from?: string; to?: string } | undefined) => void;
}) {
  const from = state?.from || "";
  const to = state?.to || "";
  return (
    <div className="space-y-2">
      <label className="block space-y-1 text-sm">
        <span className="text-muted-foreground">From</span>
        <Input
          type={type}
          step={type === "number" ? "0.01" : undefined}
          value={from}
          onChange={(e) => onChange({ from: e.target.value || undefined, to: to || undefined })}
        />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="text-muted-foreground">To</span>
        <Input
          type={type}
          step={type === "number" ? "0.01" : undefined}
          value={to}
          onChange={(e) => onChange({ from: from || undefined, to: e.target.value || undefined })}
        />
      </label>
      {(from || to) && (
        <Button variant="ghost" size="sm" className="w-full" onClick={() => onChange(undefined)}>
          Clear
        </Button>
      )}
    </div>
  );
}
