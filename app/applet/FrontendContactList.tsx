// Frontend Component File
// React / Next.js Component using the useCleanContacts hook

import React, { useMemo } from 'react';

// Example contact interface
export interface Contact {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  // ... other fields
}

/**
 * Custom Hook: useCleanContacts
 * Filters out legacy duplicate records (CT-IMP-...) when a real, cleaner UUID record exists 
 * for the same normalized name. Prioritizes records with phone numbers.
 */
export function useCleanContacts(contacts: Contact[]): Contact[] {
  return useMemo(() => {
    // Map to keep track of the "best" record for each normalized name
    const groupedByName = new Map<string, Contact>();

    contacts.forEach((contact) => {
      const normalizedName = contact.name.trim().toLowerCase();
      const existing = groupedByName.get(normalizedName);

      if (!existing) {
        groupedByName.set(normalizedName, contact);
      } else {
        // We have a collision. Determine priority.
        
        // Priority Rules:
        // 1. UUIDs (not starting with CT-IMP-) over legacy CT-IMP- IDs
        // 2. Records WITH a phone number over records WITHOUT a phone number

        const isCurrentLegacy = contact.id.startsWith('CT-IMP-');
        const isExistingLegacy = existing.id.startsWith('CT-IMP-');
        
        const currentHasPhone = Boolean(contact.phone && contact.phone.trim() !== '');
        const existingHasPhone = Boolean(existing.phone && existing.phone.trim() !== '');

        let shouldReplace = false;

        if (isExistingLegacy && !isCurrentLegacy) {
          shouldReplace = true; // Non-legacy wins
        } else if (isExistingLegacy === isCurrentLegacy) {
          // If both are legacy or both are non-legacy, phone number wins
          if (!existingHasPhone && currentHasPhone) {
            shouldReplace = true;
          }
        }

        if (shouldReplace) {
          groupedByName.set(normalizedName, contact);
        }
      }
    });

    // Return the cleaned up, deduplicated array of contacts
    return Array.from(groupedByName.values());
  }, [contacts]);
}

/**
 * Example UI Component demonstrating usage
 */
export function ContactList({ rawContacts }: { rawContacts: Contact[] }) {
  const cleanContacts = useCleanContacts(rawContacts);

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">Contacts</h2>
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <ul className="divide-y divide-gray-200">
          {cleanContacts.map((contact) => (
            <li key={contact.id} className="p-4 hover:bg-gray-50 flex justify-between items-center">
              <div>
                <p className="text-sm font-medium text-gray-900">{contact.name}</p>
                <p className="text-sm text-gray-500">{contact.phone || 'No phone'}</p>
              </div>
              <div className="text-xs text-gray-400">
                ID: {contact.id.startsWith('CT-IMP-') ? (
                  <span className="text-orange-500 font-mono">Legacy</span>
                ) : (
                  <span className="text-emerald-500 font-mono">Live</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-4 text-sm text-gray-500">
        Showing {cleanContacts.length} merged contacts out of {rawContacts.length} total.
      </div>
    </div>
  );
}

export default ContactList;
