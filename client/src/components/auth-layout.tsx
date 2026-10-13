import { LogoMark } from "@/components/logo-mark";

const STEPS = [
  { title: "Receive", text: "vouchers with the keyboard, one at a time or a whole stack." },
  { title: "Post", text: "them in batches to a company or a person, with a remittance PDF." },
  { title: "Bank", text: "the money and see a running balance and reconciliation." },
];

/** Split-screen frame shared by sign in, register and password reset: the app's front door. */
export function AuthLayout({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-wrap bg-background">
      <section className="flex min-w-0 flex-[1_1_480px] flex-col justify-between gap-12 bg-slate-900 px-8 py-10 text-slate-100 sm:px-14 sm:py-14">
        <div className="flex items-center gap-3">
          <LogoMark className="h-9 w-9" />
          <span className="text-lg font-semibold">VoucherFlow</span>
        </div>
        <div className="max-w-md">
          <h1 className="mb-4 text-4xl font-bold leading-tight tracking-tight">Your vouchers, from the door to the bank.</h1>
          <p className="mb-8 text-lg text-slate-300">Record what comes in, post it in batches, bank the money, and run the reports.</p>
          <ol className="space-y-4">
            {STEPS.map((step, i) => (
              <li key={step.title} className="flex items-start gap-3">
                <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full border border-slate-500 text-sm font-semibold">{i + 1}</span>
                <span className="text-slate-300"><strong className="text-white">{step.title}</strong> {step.text}</span>
              </li>
            ))}
          </ol>
        </div>
        <p className="text-sm text-slate-400">© {new Date().getFullYear()} VoucherFlow</p>
      </section>
      <section className="flex min-w-0 flex-[1_1_420px] items-center justify-center bg-card px-6 py-12">
        <div className="w-full max-w-sm space-y-6">
          <div>
            <h2 className="text-2xl font-bold">{title}</h2>
            <p className="mt-1 text-muted-foreground">{description}</p>
          </div>
          {children}
        </div>
      </section>
    </div>
  );
}
