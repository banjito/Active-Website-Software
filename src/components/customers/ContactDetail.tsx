import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link, useLocation } from 'react-router-dom';
import { ArrowLeft, Users, Building2, Mail, Phone, Briefcase, Calendar, Edit, Trash2, X, Save, Plus, User as UserIcon, MessageSquare } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { format } from 'date-fns';
import { toast } from '../ui/toast';

interface ContactNote {
  id: string;
  contact_id: string;
  customer_id: string;
  author_email: string;
  contact_display_name: string;
  note_type: string;
  occurred_at: string;
  context: string;
  created_at: string;
}

interface Contact {
  id: string;
  customer_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  position: string;
  is_primary: boolean;
  created_at: string;
}

interface Customer {
  id: string;
  name: string;
  company_name: string;
}

interface ContactFormData {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  position: string;
  is_primary: boolean;
}

export default function ContactDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [contact, setContact] = useState<Contact | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editFormData, setEditFormData] = useState<ContactFormData>({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    position: '',
    is_primary: false,
  });
  const [activeTab, setActiveTab] = useState<'info' | 'interactions'>('info');
  const [notes, setNotes] = useState<ContactNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [noteFilter, setNoteFilter] = useState<'all' | 'call' | 'email' | 'in_person'>('all');
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [noteFormData, setNoteFormData] = useState({ note_type: 'call', context: '', occurred_at: '' });
  const [noteFormSaving, setNoteFormSaving] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);

  useEffect(() => {
    if (user && id) {
      fetchContactData();
    }
  }, [user, id]);

  useEffect(() => {
    if (user && id && activeTab === 'interactions') {
      fetchNotes();
    }
  }, [user, id, activeTab]);

  async function fetchNotes() {
    if (!id) return;
    setNotesLoading(true);
    try {
      const { data, error } = await supabase
        .schema('common')
        .from('contact_notes')
        .select('*')
        .eq('contact_id', id)
        .order('occurred_at', { ascending: false });
      if (error) throw error;
      setNotes(data || []);
    } catch (e) {
      console.error('Error fetching contact notes:', e);
    } finally {
      setNotesLoading(false);
    }
  }

  async function handleSaveNote() {
    if (!user || !id || !contact) return;
    if (!noteFormData.context.trim()) {
      toast({ title: 'Error', description: 'Enter a note', variant: 'destructive' });
      return;
    }
    const displayName = `${contact.first_name} ${contact.last_name}`;
    setNoteFormSaving(true);
    try {
      if (editingNoteId) {
        const { error } = await supabase
          .schema('common')
          .from('contact_notes')
          .update({
            note_type: noteFormData.note_type,
            context: noteFormData.context.trim(),
            occurred_at: noteFormData.occurred_at || new Date().toISOString(),
          })
          .eq('id', editingNoteId);
        if (error) throw error;
        toast({ title: 'Updated', description: 'Interaction updated', variant: 'success' });
      } else {
        const { error } = await supabase
          .schema('common')
          .from('contact_notes')
          .insert({
            contact_id: id,
            customer_id: contact.customer_id,
            author_email: user.email || '',
            contact_display_name: displayName,
            note_type: noteFormData.note_type,
            context: noteFormData.context.trim(),
            occurred_at: noteFormData.occurred_at || new Date().toISOString(),
          });
        if (error) throw error;
        toast({ title: 'Logged', description: 'Interaction logged', variant: 'success' });
      }
      setShowNoteForm(false);
      setEditingNoteId(null);
      setNoteFormData({ note_type: 'call', context: '', occurred_at: '' });
      fetchNotes();
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message || 'Failed to save', variant: 'destructive' });
    } finally {
      setNoteFormSaving(false);
    }
  }

  async function handleDeleteNote(noteId: string) {
    try {
      const { error } = await supabase.schema('common').from('contact_notes').delete().eq('id', noteId);
      if (error) throw error;
      toast({ title: 'Deleted', description: 'Interaction deleted', variant: 'success' });
      fetchNotes();
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message || 'Failed to delete', variant: 'destructive' });
    }
  }

  async function fetchContactData() {
    try {
      // Fetch contact details
      const { data: contactData, error: contactError } = await supabase
        .schema('common')
        .from('contacts')
        .select('*')
        .eq('id', id)
        .single();

      if (contactError) {
        console.error('Error fetching contact details:', contactError);
        if (contactError.code === 'PGRST116') {
            // Handle case where contact is not found specifically
            setContact(null);
            setLoading(false);
            return;
        } else {
            throw contactError;
        }
      }
      setContact(contactData);

      if (contactData?.customer_id) {
        // Fetch related customer
        const { data: customerData, error: customerError } = await supabase
          .schema('common')
          .from('customers')
          .select('id, name, company_name')
          .eq('id', contactData.customer_id)
          .single();

        if (customerError) {
            console.error('Error fetching related customer:', customerError);
            // If customer not found, still show contact details
            setCustomer(null);
        } else {
            setCustomer(customerData);
        }
      } else {
          setCustomer(null); // No customer_id associated
      }
    } catch (error) {
      console.error('Error in fetchContactData:', error);
      // Setting contact to null will trigger the "Contact not found" message
      setContact(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!contact || !user) return;

    try {
      setIsSaving(true);
      const { error } = await supabase
        .schema('common')
        .from('contacts')
        .update(editFormData)
        .eq('id', contact.id);

      if (error) throw error;

      setIsEditing(false);
      await fetchContactData();
      toast({
        title: 'Saved',
        description: 'Contact updated successfully',
        variant: 'success',
      });
    } catch (error) {
      console.error('Error updating contact:', error);
      toast({
        title: 'Error',
        description: 'Failed to update contact',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (!contact || !user) return;

    try {
      const { error } = await supabase
        .schema('common')
        .from('contacts')
        .delete()
        .eq('id', contact.id);

      if (error) throw error;

      toast({
        title: 'Deleted',
        description: 'Contact deleted successfully',
        variant: 'success',
      });

      // Navigate back to contacts list
      const currentPath = location.pathname;
      if (currentPath.startsWith('/sales-dashboard')) {
        navigate('/sales-dashboard/contacts');
      } else {
        const parts = currentPath.split('/').filter(Boolean);
        if (parts.length >= 1) {
          const division = parts[0];
          navigate(`/${division}/contacts`);
        } else {
          navigate('/contacts');
        }
      }
    } catch (error) {
      console.error('Error deleting contact:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete contact',
        variant: 'destructive',
      });
    } finally {
      setShowDeleteConfirm(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg text-gray-600">Loading...</div>
      </div>
    );
  }

  if (!contact) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg text-gray-600">Contact not found</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center">
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 mr-4"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </button>
          <div className="flex items-center">
            <Users className="h-8 w-8 text-[#f26722]" />
            <h1 className="ml-3 text-2xl font-semibold text-gray-900 dark:text-white">
              {contact.first_name} {contact.last_name}
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {contact.is_primary && (
            <span className="inline-flex rounded-full px-3 py-1 text-sm font-semibold bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
              Primary Contact
            </span>
          )}
          {!isEditing && (
            <>
              <button
                onClick={() => {
                  setIsEditing(true);
                  setEditFormData({
                    first_name: contact.first_name,
                    last_name: contact.last_name,
                    email: contact.email,
                    phone: contact.phone || '',
                    position: contact.position || '',
                    is_primary: contact.is_primary,
                  });
                }}
                className="px-4 py-2 bg-[#f26722] text-white rounded hover:bg-[#f26722]/90 transition-colors flex items-center"
              >
                <Edit className="h-4 w-4 mr-1" />
                Edit
              </button>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors flex items-center"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Delete
              </button>
            </>
          )}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-dark-150 rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Delete Contact</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">
              Are you sure you want to delete {contact.first_name} {contact.last_name}? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex space-x-1 mb-6 border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setActiveTab('info')}
          className={`px-4 py-2.5 text-sm font-medium rounded-t-md transition-colors ${activeTab === 'info' ? 'text-[#f26722] border-b-2 border-[#f26722] bg-white dark:bg-dark-150' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}
        >
          <span className="flex items-center gap-1.5"><Users className="h-4 w-4" /> Info</span>
        </button>
        <button
          onClick={() => setActiveTab('interactions')}
          className={`px-4 py-2.5 text-sm font-medium rounded-t-md transition-colors ${activeTab === 'interactions' ? 'text-[#f26722] border-b-2 border-[#f26722] bg-white dark:bg-dark-150' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}
        >
          <span className="flex items-center gap-1.5"><MessageSquare className="h-4 w-4" /> Interactions {notes.length > 0 && <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300">{notes.length}</span>}</span>
        </button>
      </div>

      {activeTab === 'info' && (
      <>
      {isEditing ? (
        <div className="bg-white dark:bg-dark-150 rounded-lg shadow p-6 mb-8">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Edit Contact Information</h2>
          <form onSubmit={(e) => { e.preventDefault(); handleSave(); }} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  First Name
                </label>
                <input
                  type="text"
                  value={editFormData.first_name}
                  onChange={(e) => setEditFormData({ ...editFormData, first_name: e.target.value })}
                  className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-dark-200 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#f26722]"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Last Name
                </label>
                <input
                  type="text"
                  value={editFormData.last_name}
                  onChange={(e) => setEditFormData({ ...editFormData, last_name: e.target.value })}
                  className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-dark-200 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#f26722]"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={editFormData.email}
                  onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                  className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-dark-200 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#f26722]"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Phone
                </label>
                <input
                  type="tel"
                  value={editFormData.phone}
                  onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                  className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-dark-200 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#f26722]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Position
                </label>
                <input
                  type="text"
                  value={editFormData.position}
                  onChange={(e) => setEditFormData({ ...editFormData, position: e.target.value })}
                  className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-dark-200 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#f26722]"
                />
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="is_primary"
                  checked={editFormData.is_primary}
                  onChange={(e) => setEditFormData({ ...editFormData, is_primary: e.target.checked })}
                  className="h-4 w-4 text-[#f26722] focus:ring-[#f26722] border-gray-300 rounded"
                />
                <label htmlFor="is_primary" className="ml-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                  Primary Contact
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <button
                type="button"
                onClick={() => {
                  setIsEditing(false);
                  setEditFormData({
                    first_name: contact.first_name,
                    last_name: contact.last_name,
                    email: contact.email,
                    phone: contact.phone || '',
                    position: contact.position || '',
                    is_primary: contact.is_primary,
                  });
                }}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                disabled={isSaving}
              >
                <X className="h-4 w-4 inline mr-1" />
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-[#f26722] text-white rounded hover:bg-[#f26722]/90 transition-colors flex items-center"
                disabled={isSaving}
              >
                <Save className="h-4 w-4 mr-1" />
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-white dark:bg-dark-150 rounded-lg shadow p-6">
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Contact Information</h2>
            <div className="space-y-4">
              <div className="flex items-start">
                <Mail className="h-5 w-5 text-[#f26722] mt-0.5" />
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-500 dark:text-white">Email</p>
                  <a 
                    href={`mailto:${contact.email}`} 
                    className="text-sm text-[#f26722] hover:text-[#f26722]/90 dark:text-[#f26722] dark:hover:text-[#f26722]/90"
                  >
                    {contact.email}
                  </a>
                </div>
              </div>
              <div className="flex items-start">
                <Phone className="h-5 w-5 text-[#f26722] mt-0.5" />
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-500 dark:text-white">Phone</p>
                  {contact.phone ? (
                    <a
                      href={`tel:${contact.phone}`}
                      className="text-sm text-[#f26722] hover:text-[#f26722]/90"
                    >
                      {contact.phone}
                    </a>
                  ) : (
                    <p className="text-sm text-gray-900 dark:text-white">-</p>
                  )}
                </div>
              </div>
              <div className="flex items-start">
                <Briefcase className="h-5 w-5 text-[#f26722] mt-0.5" />
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-500 dark:text-white">Position</p>
                  <p className="text-sm text-gray-900 dark:text-white">{contact.position || '-'}</p>
                </div>
              </div>
              <div className="flex items-start">
                <Calendar className="h-5 w-5 text-[#f26722] mt-0.5" />
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-500 dark:text-white">Created</p>
                  <p className="text-sm text-gray-900 dark:text-white">
                    {format(new Date(contact.created_at), 'MMM d, yyyy')}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-dark-150 rounded-lg shadow p-6">
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Company Information</h2>
            {customer ? (() => {
              // Build a route that matches configured routes
              const currentPath = location.pathname;
              let toPath = `/sales-dashboard/customers/${customer.id}`;
              if (currentPath.startsWith('/sales-dashboard')) {
                toPath = `/sales-dashboard/customers/${customer.id}`;
              } else {
                const parts = currentPath.split('/').filter(Boolean);
                if (parts.length >= 1) {
                  const division = parts[0];
                  toPath = `/${division}/customers/${customer.id}`;
                }
              }
              return (
                <Link 
                  to={toPath}
                  className="block hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <div className="space-y-4">
                    <div className="flex items-start">
                      <Building2 className="h-5 w-5 text-[#f26722] mt-0.5" />
                      <div className="ml-3">
                        <p className="text-sm font-medium text-gray-500 dark:text-white">Company</p>
                        <p className="text-sm text-[#f26722] hover:text-[#f26722]/90 dark:text-[#f26722] dark:hover:text-[#f26722]/90">
                          {customer.company_name || customer.name}
                        </p>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })() : (
              <p className="text-sm text-gray-500 dark:text-white">No company information available</p>
            )}
          </div>
        </div>
      )}
      </>
      )}

      {/* Interactions Tab */}
      {activeTab === 'interactions' && (() => {
        const filteredNotes = noteFilter === 'all' ? notes : notes.filter(n => n.note_type === noteFilter);
        const noteTypeIcon = (type: string) => {
          if (type === 'call') return <Phone className="h-4 w-4 text-[#f26722]" />;
          if (type === 'email') return <Mail className="h-4 w-4 text-blue-600 dark:text-blue-400" />;
          return <UserIcon className="h-4 w-4 text-purple-600 dark:text-purple-400" />;
        };
        const noteTypeBg = (type: string) => {
          if (type === 'call') return 'bg-[#f26722]/10';
          if (type === 'email') return 'bg-blue-100 dark:bg-blue-900';
          return 'bg-purple-100 dark:bg-purple-900';
        };
        const noteTypeLabel = (type: string) => {
          if (type === 'call') return 'Call';
          if (type === 'email') return 'Email';
          return 'In Person';
        };
        const noteTypeBadge = (type: string) => {
          if (type === 'call') return 'bg-[#f26722]/10 text-[#f26722]';
          if (type === 'email') return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
          return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
        };
        return (
          <div className="bg-white dark:bg-dark-150 rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Interactions</h2>
              <button
                onClick={() => { setShowNoteForm(true); setEditingNoteId(null); setNoteFormData({ note_type: 'call', context: '', occurred_at: '' }); }}
                className="inline-flex items-center justify-center rounded-md border border-transparent bg-[#f26722] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#f26722]/90"
              >
                <Plus className="h-4 w-4 mr-1" />
                Log Interaction
              </button>
            </div>

            {/* Filter tabs */}
            <div className="flex space-x-4 mb-6 border-b border-gray-200 dark:border-gray-700">
              {(['all', 'call', 'email', 'in_person'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setNoteFilter(f)}
                  className={`px-4 py-2 text-sm font-medium ${noteFilter === f ? 'text-[#f26722] border-b-2 border-[#f26722]' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}
                >
                  {f === 'all' ? 'All' : f === 'call' ? 'Calls' : f === 'email' ? 'Emails' : 'In Person'}
                </button>
              ))}
            </div>

            {/* Log form */}
            {showNoteForm && (
              <div className="mb-6 bg-gray-50 dark:bg-dark-200 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">{editingNoteId ? 'Edit Interaction' : 'Log Interaction'}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Type</label>
                    <select
                      value={noteFormData.note_type}
                      onChange={e => setNoteFormData(p => ({ ...p, note_type: e.target.value }))}
                      className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-dark-150 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-[#f26722]"
                    >
                      <option value="call">Call</option>
                      <option value="email">Email</option>
                      <option value="in_person">In Person</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Date / Time</label>
                    <input
                      type="datetime-local"
                      value={noteFormData.occurred_at}
                      onChange={e => setNoteFormData(p => ({ ...p, occurred_at: e.target.value }))}
                      className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-dark-150 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-[#f26722]"
                    />
                  </div>
                </div>
                <div className="mb-3">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Notes</label>
                  <textarea
                    rows={3}
                    value={noteFormData.context}
                    onChange={e => setNoteFormData(p => ({ ...p, context: e.target.value }))}
                    placeholder="What happened during this interaction..."
                    className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-dark-150 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-[#f26722]"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button onClick={() => { setShowNoteForm(false); setEditingNoteId(null); }} className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded">Cancel</button>
                  <button onClick={handleSaveNote} disabled={noteFormSaving} className="px-4 py-1.5 text-sm bg-[#f26722] text-white rounded hover:bg-[#f26722]/90 disabled:opacity-50">
                    {noteFormSaving ? 'Saving...' : editingNoteId ? 'Update' : 'Save'}
                  </button>
                </div>
              </div>
            )}

            {/* Timeline */}
            {notesLoading ? (
              <div className="py-12 text-center text-gray-500">Loading interactions...</div>
            ) : filteredNotes.length === 0 ? (
              <div className="py-12 text-center text-gray-500">
                <p className="text-sm">No interactions logged yet.</p>
                <p className="text-xs mt-1">Click "Log Interaction" to add one.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredNotes.map((note, idx) => (
                  <div key={note.id} className="relative">
                    {idx < filteredNotes.length - 1 && <div className="absolute top-0 left-6 h-full w-0.5 bg-gray-200 dark:bg-gray-700" />}
                    <div className="flex items-start relative">
                      <div className="absolute top-0 left-0 h-12 w-12 flex items-center justify-center z-10">
                        <div className={`h-8 w-8 rounded-full ${noteTypeBg(note.note_type)} flex items-center justify-center border-4 border-white dark:border-gray-800`}>
                          {noteTypeIcon(note.note_type)}
                        </div>
                      </div>
                      <div className="ml-16 bg-white dark:bg-dark-150 p-4 rounded-lg shadow-sm border border-gray-200 dark:border-gray-600 w-full">
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                              {noteTypeLabel(note.note_type)}
                            </h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {format(new Date(note.occurred_at), 'MMM d, yyyy \'at\' h:mm a')}
                            </p>
                          </div>
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${noteTypeBadge(note.note_type)}`}>
                            {noteTypeLabel(note.note_type)}
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap">{note.context}</p>
                        <div className="mt-3 flex justify-between items-center">
                          <p className="text-xs text-gray-500 dark:text-gray-400">Logged by: {note.author_email}</p>
                          <div className="flex space-x-2">
                            <button
                              onClick={() => {
                                setEditingNoteId(note.id);
                                setNoteFormData({
                                  note_type: note.note_type,
                                  context: note.context,
                                  occurred_at: note.occurred_at ? new Date(note.occurred_at).toISOString().slice(0, 16) : '',
                                });
                                setShowNoteForm(true);
                              }}
                              className="text-sm text-[#f26722] hover:text-[#f26722]/80 flex items-center gap-0.5"
                            >
                              <Edit className="h-3 w-3" /> Edit
                            </button>
                            <button
                              onClick={() => handleDeleteNote(note.id)}
                              className="text-sm text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 flex items-center gap-0.5"
                            >
                              <Trash2 className="h-3 w-3" /> Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 text-sm text-gray-500 dark:text-gray-400">
              {filteredNotes.length} interaction{filteredNotes.length !== 1 ? 's' : ''}
            </div>
          </div>
        );
      })()}
    </div>
  );
}