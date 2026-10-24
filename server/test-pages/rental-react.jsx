/**
 * Source of /test/rental-react.html. Every input is React-CONTROLLED (value + onChange in state),
 * so setting el.value directly does nothing: Paperwise must use the native setter + events.
 * Conditional fields: "Employer" only when employed / self-employed, "Describe your pets" only
 * when pets = yes.
 *
 * Bundled with React into server/public/test/rental-react.js by `pnpm build:test-pages`
 * (no internet needed at demo time). Rebuild after editing this file.
 */
import { useState } from 'react';
import { createRoot } from 'react-dom/client';

const initial = {
  first_name: '', last_name: '', dob: '', email: '', phone: '', ssn: '',
  employment_status: '', employer: '', gross_monthly_income: '',
  move_in: '', pets: '', pets_description: '', cosigner: '',
  credit_check_consent: false, certify: false,
};

function App() {
  const [form, setForm] = useState(initial);
  const [submitted, setSubmitted] = useState(null);
  const set = (name, value) => setForm((f) => ({ ...f, [name]: value }));

  const showEmployer = form.employment_status === 'employed' || form.employment_status === 'self';
  const showPetsDesc = form.pets === 'yes';

  const text = (id, name, label, type = 'text', extra = {}) => (
    <>
      <label htmlFor={id}>{label}</label>
      <input id={id} name={name} type={type} value={form[name]} onChange={(e) => set(name, e.target.value)} {...extra} />
    </>
  );

  const check = (id, name, label) => (
    <>
      <input id={id} name={name} type="checkbox" required checked={form[name]} onChange={(e) => set(name, e.target.checked)} />
      <label htmlFor={id} style={{ display: 'inline' }}>{label}</label>
      <br />
    </>
  );

  const radio = (value, label) => (
    <>
      <input id={`pets-${value}`} name="pets" type="radio" value={value} required checked={form.pets === value} onChange={() => set('pets', value)} />
      <label htmlFor={`pets-${value}`}>{label}</label>
    </>
  );

  const onSubmit = (e) => {
    e.preventDefault();
    // Submit only what is visible, like a real form would.
    const out = { ...form };
    if (!showEmployer) delete out.employer;
    if (!showPetsDesc) delete out.pets_description;
    setSubmitted(out);
  };

  return (
    <div>
      <h1>Rental Application</h1>
      <p>
        Maple Street Apartments · Unit 4B <span className="note">(React version)</span>
      </p>
      <form id="rental" onSubmit={onSubmit}>
        <fieldset>
          <legend>Applicant information</legend>
          {text('first', 'first_name', 'First name *', 'text', { required: true, autoComplete: 'given-name' })}
          {text('last', 'last_name', 'Last name *', 'text', { required: true, autoComplete: 'family-name' })}
          {text('dob', 'dob', 'Date of birth *', 'date', { required: true })}
          {text('email', 'email', 'Email', 'email', { autoComplete: 'email' })}
          {text('phone', 'phone', 'Phone number *', 'tel', { required: true, autoComplete: 'tel' })}
          {text('ssn', 'ssn', 'Social Security Number *', 'text', { required: true, inputMode: 'numeric', maxLength: 11 })}
        </fieldset>

        <fieldset>
          <legend>Employment and income</legend>
          <label htmlFor="status">Employment status *</label>
          <select id="status" name="employment_status" required value={form.employment_status} onChange={(e) => set('employment_status', e.target.value)}>
            <option value="">Select…</option>
            <option value="employed">Employed</option>
            <option value="self">Self-employed</option>
            <option value="student">Student</option>
            <option value="unemployed">Unemployed</option>
            <option value="retired">Retired</option>
          </select>
          {showEmployer && text('employer', 'employer', 'Employer name')}
          {text('income', 'gross_monthly_income', 'Gross monthly income (USD) *', 'number', { required: true, min: 0 })}
        </fieldset>

        <fieldset>
          <legend>Rental details</legend>
          {text('movein', 'move_in', 'Desired move-in date *', 'date', { required: true })}
          <p style={{ margin: '10px 0 4px' }}>Do you have pets? *</p>
          <div className="inline" role="radiogroup" aria-label="Do you have pets?">
            {radio('yes', 'Yes')}
            {radio('no', 'No')}
          </div>
          {showPetsDesc && (
            <>
              <label htmlFor="pets-desc">Describe your pets</label>
              <textarea id="pets-desc" name="pets_description" rows={2} value={form.pets_description} onChange={(e) => set('pets_description', e.target.value)} />
            </>
          )}
          {text('cosigner', 'cosigner', 'Co-signer full name (if any)')}
        </fieldset>

        <fieldset>
          <legend>Authorization</legend>
          {check('credit', 'credit_check_consent', 'I authorize the landlord to obtain my credit report and verify the information above. *')}
          {check('truth', 'certify', 'I certify that the information provided is true and complete. *')}
        </fieldset>

        <button type="submit">Submit application</button>
      </form>

      <h2>Submitted values (React state)</h2>
      <pre id="submitted" style={{ background: '#f4f4f4', padding: 8, whiteSpace: 'pre-wrap' }}>
        {submitted ? JSON.stringify(submitted, null, 2) : 'Nothing submitted yet.'}
      </pre>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
