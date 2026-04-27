/** Static headings: parent supplies `max-w-7xl` wrapper for alignment with main settings grid. */
export function SettingsPageShell() {
  return (
    <>
      <h1 className="hidden text-2xl font-bold text-slate-900 dark:text-white lg:block">Settings</h1>
      <p className="mt-1 hidden text-slate-600 dark:text-slate-400 lg:block">
        Manage your account, business profile for invoices and customer email, plus invoices, payments, tax, and
        customers.
      </p>
    </>
  );
}
