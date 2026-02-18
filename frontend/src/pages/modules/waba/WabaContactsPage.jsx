import { useEffect, useMemo, useState } from 'react'
import { apiGet, apiPost, apiPostForm, apiRequest } from '../../../api/client'
import { useAuth } from '../../../auth/AuthProvider'
import { useToast } from '../../../feedback/ToastProvider'
import WabaShell from '../../../components/waba/WabaShell'

export default function WabaContactsPage() {
  const { session } = useAuth()
  const toast = useToast()
  const canWrite = useMemo(() => ['owner', 'admin'].includes((session.role || '').toLowerCase()), [session.role])
  const [contacts, setContacts] = useState([])
  const [groups, setGroups] = useState([])
  const [draft, setDraft] = useState({ name: '', phone: '', groupId: '' })
  const [groupName, setGroupName] = useState('')
  const [segmentName, setSegmentName] = useState('')
  const [segments, setSegments] = useState([])
  const [csvFile, setCsvFile] = useState(null)
  const [editingId, setEditingId] = useState('')
  const [editDraft, setEditDraft] = useState({ name: '', phone: '', groupId: '' })

  async function load() {
    const [c, g, s] = await Promise.all([apiGet('/api/contacts'), apiGet('/api/contact-groups'), apiGet('/api/contact-data/segments')])
    setContacts(c); setGroups(g); setSegments(s)
  }
  useEffect(() => { load() }, [])

  async function addContact() { const optimistic = { id: `tmp-${Date.now()}`, ...draft }; const prev = contacts; setContacts([optimistic, ...contacts]); try { await apiPost('/api/contacts', { ...draft, groupId: draft.groupId || null }); setDraft({ name: '', phone: '', groupId: '' }); toast.success('Contact added'); load() } catch { setContacts(prev); toast.error('Contact add failed') } }
  async function addGroup() { const optimistic = { id: `tmp-${Date.now()}`, name: groupName }; const prev = groups; setGroups([...groups, optimistic]); try { await apiPost('/api/contact-groups', { name: groupName }); setGroupName(''); toast.success('Group added'); load() } catch { setGroups(prev); toast.error('Group add failed') } }

  async function updateContact(id) {
    const prev = contacts
    setContacts(contacts.map((c) => c.id === id ? { ...c, ...editDraft } : c))
    try {
      const res = await apiRequest(`/api/contacts/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...editDraft, groupId: editDraft.groupId || null }) })
      if (!res.ok) throw new Error()
      setEditingId('')
      toast.success('Contact updated')
    } catch { setContacts(prev); toast.error('Contact update failed') }
  }

  async function removeContact(id) { const prev = contacts; setContacts(contacts.filter((x) => x.id !== id)); try { const res = await apiRequest(`/api/contacts/${id}`, { method: 'DELETE' }); if (!res.ok) throw new Error(); toast.success('Contact deleted') } catch { setContacts(prev); toast.error('Contact delete failed') } }

  async function importCsv() {
    if (!csvFile) return
    const fd = new FormData()
    fd.append('file', csvFile)
    try {
      const res = await apiPostForm('/api/contact-data/import/csv', fd)
      toast.success(`Imported ${res.imported || 0} contacts`)
      load()
    } catch {
      toast.error('CSV import failed')
    }
  }

  async function createSegment() {
    if (!segmentName.trim()) return
    try {
      await apiPost('/api/contact-data/segments', { name: segmentName, ruleJson: '{}' })
      toast.success('Segment added')
      setSegmentName('')
      load()
    } catch {
      toast.error('Segment add failed')
    }
  }

  async function setOptIn(contactId, status) {
    try {
      await apiPost(`/api/contact-data/contacts/${contactId}/opt-in`, { status })
      toast.success('Opt-in updated')
      load()
    } catch {
      toast.error('Opt-in update failed')
    }
  }

  return <WabaShell><div className="templates-head"><h1>Contacts</h1></div><section className="panel dark contact-grid"><div><h3>Add Contact</h3><div className="campaign-form"><input placeholder="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /><input placeholder="Phone" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} /><select value={draft.groupId} onChange={(e) => setDraft({ ...draft, groupId: e.target.value })}><option value="">No Group</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></div>{canWrite && <div className="actions"><button className="primary" onClick={addContact}>Add Contact</button></div>}<h3 style={{ marginTop: 16 }}>Contact Groups</h3><div className="campaign-form"><input placeholder="Group name" value={groupName} onChange={(e) => setGroupName(e.target.value)} /></div>{canWrite && <div className="actions"><button className="ghost" onClick={addGroup}>Add Group</button></div>}<h3 style={{ marginTop: 16 }}>CSV Import</h3><div className="campaign-form"><input type="file" accept=".csv" onChange={(e) => setCsvFile(e.target.files?.[0] || null)} /></div>{canWrite && <div className="actions"><button className="ghost" onClick={importCsv}>Import CSV</button></div>}<h3 style={{ marginTop: 16 }}>Segments</h3><div className="campaign-form"><input placeholder="Segment name" value={segmentName} onChange={(e)=>setSegmentName(e.target.value)} /></div>{canWrite && <div className="actions"><button className="ghost" onClick={createSegment}>Add Segment</button></div>}<div>{segments.map((s)=><div key={s.id} className="row">{s.name}</div>)}</div></div><div><h3>Contact List</h3><table className="tpl-table"><thead><tr><th>Name</th><th>Phone</th><th>Group</th><th>Opt-In</th><th /></tr></thead><tbody>{contacts.map((c) => <tr key={c.id}><td>{editingId===c.id?<input value={editDraft.name} onChange={(e)=>setEditDraft({...editDraft,name:e.target.value})}/>:c.name}</td><td>{editingId===c.id?<input value={editDraft.phone} onChange={(e)=>setEditDraft({...editDraft,phone:e.target.value})}/>:c.phone}</td><td>{editingId===c.id?<select value={editDraft.groupId||''} onChange={(e)=>setEditDraft({...editDraft,groupId:e.target.value})}><option value="">No Group</option>{groups.map((g)=><option key={g.id} value={g.id}>{g.name}</option>)}</select>:(groups.find((g) => g.id === c.groupId)?.name || '-')}</td><td>{c.optInStatus || 'unknown'}</td><td>{canWrite && (editingId===c.id? <><button className="primary" onClick={()=>updateContact(c.id)}>Save</button><button className="ghost" onClick={()=>setEditingId('')}>Cancel</button></> : <><button className="ghost" onClick={()=>{setEditingId(c.id);setEditDraft({name:c.name,phone:c.phone,groupId:c.groupId||''})}}>Edit</button><button className="ghost" onClick={() => setOptIn(c.id, 'opted_in')}>Opt-In</button><button className="ghost" onClick={() => setOptIn(c.id, 'opted_out')}>Opt-Out</button><button className="ghost" onClick={() => removeContact(c.id)}>Delete</button></>)}</td></tr>)}</tbody></table></div></section></WabaShell>
}
