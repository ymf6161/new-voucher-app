/** VoucherFlow mark: a notched voucher with a flow arrow. Same drawing as public/favicon.svg. */
export function LogoMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="#0B64F4" />
      <path
        fill="#FFFFFF"
        d="M14 17h36a4 4 0 0 1 4 4v6a5 5 0 0 0 0 10v6a4 4 0 0 1-4 4H14a4 4 0 0 1-4-4v-6a5 5 0 0 0 0-10v-6a4 4 0 0 1 4-4z"
      />
      <path d="M21 32h19M34 25l7 7-7 7" fill="none" stroke="#0B64F4" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
