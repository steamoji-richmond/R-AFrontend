import AddSession from './AddSession.jsx'

export default function AddSessionsSection({ branches = [], onChanged }) {
  return <AddSession branches={branches} onAdded={onChanged} />
}
