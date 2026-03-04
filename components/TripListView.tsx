
import React, { useState } from 'react';
import type { Trip } from '../types';
import { BackIcon, BookOpenIcon, EditIcon } from './icons';

interface TripListViewProps {
  trips: Trip[];
  activeTripId: string | null;
  onBack: () => void;
  onCreateTrip: (name: string) => void;
  onRenameTrip: (tripId: string, newName: string) => void;
  onSetActiveTrip: (tripId: string) => void;
  onSelectTrip: (tripId: string) => void;
}

export const TripListView: React.FC<TripListViewProps> = ({
  trips, activeTripId, onBack, onCreateTrip, onRenameTrip, onSetActiveTrip, onSelectTrip
}) => {
  const [newTripName, setNewTripName] = useState('');
  const [editingTripId, setEditingTripId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const handleCreate = () => {
    if (newTripName.trim()) {
      onCreateTrip(newTripName.trim());
      setNewTripName('');
    }
  };

  const handleStartRename = (trip: Trip) => {
    setEditingTripId(trip.id);
    setEditingName(trip.name);
  };
  
  const handleFinishRename = () => {
    if (editingTripId && editingName.trim()) {
      onRenameTrip(editingTripId, editingName.trim());
    }
    setEditingTripId(null);
    setEditingName('');
  };

  return (
    <div className="absolute inset-0 bg-stone-100 flex flex-col z-20">
      <header className="flex-shrink-0 bg-white/80 backdrop-blur-sm p-4 flex items-center justify-between border-b border-stone-200 z-10">
        <button onClick={onBack} className="p-2 text-stone-500 hover:text-orange-500 rounded-full hover:bg-stone-200">
          <BackIcon className="w-6 h-6" />
        </button>
        <h1 className="text-xl font-bold text-stone-800">My Trip Journals</h1>
        <div className="w-10"></div>
      </header>

      <div className="p-4 border-b border-stone-200">
        <div className="flex gap-2">
            <input 
                type="text" 
                value={newTripName}
                onChange={(e) => setNewTripName(e.target.value)}
                placeholder="New trip name, e.g. 'Paris 2024'"
                className="flex-grow p-3 border border-stone-300 rounded-lg focus:ring-2 focus:ring-maroon focus:outline-none"
            />
            <button onClick={handleCreate} className="bg-maroon text-white font-bold py-3 px-5 rounded-lg hover:bg-maroon/90 transition-colors">
                Create
            </button>
        </div>
      </div>

      {trips.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-stone-500">
            <BookOpenIcon className="w-20 h-20 mb-4" />
            <h2 className="text-2xl font-bold text-stone-700">Your First Trip Awaits</h2>
            <p className="text-stone-500 mt-2 max-w-sm">
                Give your new journey a name above to get started. Saved discoveries will appear in your journals.
            </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {trips.map((trip) => (
            <div key={trip.id} className={`bg-white rounded-2xl shadow-md overflow-hidden transition-all border-2 ${activeTripId === trip.id ? 'border-orange-500 shadow-lg' : 'border-transparent'}`}>
              <div className="p-4 flex items-center justify-between">
                {editingTripId === trip.id ? (
                    <input 
                        type="text"
                        value={editingName}
                        onChange={e => setEditingName(e.target.value)}
                        onBlur={handleFinishRename}
                        onKeyDown={e => e.key === 'Enter' && handleFinishRename()}
                        className="text-lg font-bold text-stone-800 bg-stone-100 p-1 rounded"
                        autoFocus
                    />
                ) : (
                    <div className="flex items-center gap-3 cursor-pointer flex-grow" onClick={() => onSelectTrip(trip.id)}>
                        {trip.highlights.length > 0 ? (
                            <img src={trip.highlights[0].imageData} alt="" className="w-16 h-16 rounded-lg object-cover" />
                        ) : (
                            <div className="w-16 h-16 rounded-lg bg-stone-200 flex items-center justify-center">
                                <BookOpenIcon className="w-8 h-8 text-stone-400" />
                            </div>
                        )}
                        <div>
                            <h2 className="text-lg font-bold text-stone-800">{trip.name}</h2>
                            <p className="text-sm text-stone-500">{trip.highlights.length} highlight{trip.highlights.length !== 1 && 's'}</p>
                        </div>
                    </div>
                )}
                <div className="flex items-center gap-2">
                    <button onClick={() => handleStartRename(trip)} className="p-2 text-stone-400 hover:text-orange-500">
                        <EditIcon className="w-5 h-5" />
                    </button>
                    <button onClick={() => onSetActiveTrip(trip.id)} className={`text-xs font-bold py-1 px-3 rounded-full ${activeTripId === trip.id ? 'bg-orange-500 text-white' : 'bg-stone-200 text-stone-600 hover:bg-stone-300'}`}>
                        {activeTripId === trip.id ? 'Active' : 'Set Active'}
                    </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
