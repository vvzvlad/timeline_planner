<script>
  import { eventsStore, SEPARATOR_NAME } from "../stores/events";
  import { onMount } from 'svelte';
  
  export let events;

  const API_BASE_URL = 'https://jsonstorage.vvzvlad.xyz/store';
  let storageId = '';
  let saveTimeout;

  async function loadFromStorage(id) {
    try {
      const response = await fetch(`${API_BASE_URL}/${id}`);
      if (!response.ok) {
        console.error(`Storage error: Failed to load data for ID ${id}, status: ${response.status}`);
        return null;
      }
      return await response.json();
    } catch (error) {
      console.error(`Storage error: Failed to load data for ID ${id}`, error);
      return null;
    }
  }

  async function saveToStorage(data) {
    try {
      const response = await fetch(`${API_BASE_URL}/${storageId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data)
      });
      if (!response.ok) {
        console.error(`Storage error: Failed to save data, status: ${response.status}`);
      }
    } catch (error) {
      console.error(`Storage error: Failed to save data`, error);
    }
  }

  function debouncedSave(data) {
    if (saveTimeout) {
      clearTimeout(saveTimeout);
    }
    saveTimeout = setTimeout(() => {
      saveToStorage(data);
    }, 2000);
  }

  async function initializeStorage() {
    const urlParams = new URLSearchParams(window.location.search);
    let id = urlParams.get('id');
    
    if (!id) {
      id = crypto.randomUUID();
      const newUrl = `${window.location.pathname}?id=${id}`;
      window.history.pushState({ id }, '', newUrl);
    }
    
    storageId = id;
    const storedData = await loadFromStorage(id);
    
    if (storedData) {
      const parsedEvents = storedData.map(event => ({
        ...event,
        start: new Date(event.start)
      }));
      eventsStore.set(parsedEvents);
    }
  }

  onMount(() => {
    initializeStorage();
    
    eventsStore.subscribe(updatedEvents => {
      if (storageId && updatedEvents) {
        debouncedSave(updatedEvents);
      }
    });

    return () => {
      if (saveTimeout) {
        clearTimeout(saveTimeout);
      }
    };
  });

  function formatDuration(ms) {
    return Math.round(ms / 1000 / 60);
  }

  function formatTimeForInput(date) {
    return date.toTimeString().slice(0, 5); // Формат HH:MM
  }

  function parseTimeInput(timeStr, originalDate) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const newDate = new Date(originalDate);
    newDate.setHours(hours, minutes, 0, 0);
    return newDate;
  }

  function toggleLock(event) {
    const eventIndex = events.findIndex(e => e.id === event.id);
    if (eventIndex === -1) return;

    const updatedEvents = [...events];
    updatedEvents[eventIndex].locked = !updatedEvents[eventIndex].locked;
    eventsStore.set(updatedEvents);
  }

  function updateStartTime(event, timeStr) {
    if (event.name === SEPARATOR_NAME || event.locked) return;
    
    const eventIndex = events.findIndex(e => e.id === event.id);
    if (eventIndex === -1) return;

    const newStart = parseTimeInput(timeStr, event.start);
    const updatedEvents = [...events];
    updatedEvents[eventIndex].start = newStart;

    // Обновляем позиции связанных событий
    let currentIndex = eventIndex;
    let currentTime = newStart;

    // Двигаем события вперед
    while (currentIndex < events.length - 1) {
      if (updatedEvents[currentIndex].name !== SEPARATOR_NAME) {
        currentTime = new Date(currentTime.getTime() + updatedEvents[currentIndex].duration);
      }
      
      if (currentIndex + 1 < events.length && events[currentIndex + 1].name === SEPARATOR_NAME) {
        // Есть разделитель, двигаем следующее событие
        if (currentIndex + 2 < events.length && !events[currentIndex + 2].locked) {
          updatedEvents[currentIndex + 2].start = currentTime;
          currentIndex += 2;
        } else {
          break;
        }
      } else {
        break;
      }
    }

    // Двигаем события назад
    currentIndex = eventIndex;
    currentTime = newStart;

    while (currentIndex > 1) {
      if (events[currentIndex - 1].name === SEPARATOR_NAME) {
        // Есть разделитель, двигаем предыдущее событие
        const prevEventIndex = currentIndex - 2;
        if (prevEventIndex >= 0 && !events[prevEventIndex].locked) {
          currentTime = new Date(currentTime.getTime() - updatedEvents[prevEventIndex].duration);
          updatedEvents[prevEventIndex].start = currentTime;
          currentIndex = prevEventIndex;
        } else {
          break;
        }
      } else {
        break;
      }
    }

    eventsStore.set(updatedEvents);
  }

  function updateDuration(event, minutes) {
    if (event.name === SEPARATOR_NAME || event.locked) return;
    
    const newDuration = minutes * 60 * 1000;
    const eventIndex = events.findIndex(e => e.id === event.id);
    
    if (eventIndex !== -1) {
      const updatedEvents = [...events];
      updatedEvents[eventIndex].duration = newDuration;
      
      // Recalculate chain
      let currentTime = updatedEvents[eventIndex].start;
      for (let i = eventIndex; i < updatedEvents.length; i++) {
        if (updatedEvents[i].locked) break;
        updatedEvents[i].start = currentTime;
        if (updatedEvents[i].name !== SEPARATOR_NAME) {
          currentTime = new Date(currentTime.getTime() + updatedEvents[i].duration);
        }
      }
      
      eventsStore.set(updatedEvents);
    }
  }

  function updateName(event, newName) {
    if (event.name === SEPARATOR_NAME || event.locked) return;
    
    const eventIndex = events.findIndex(e => e.id === event.id);
    
    if (eventIndex !== -1) {
      const updatedEvents = [...events];
      updatedEvents[eventIndex].name = newName;
      eventsStore.set(updatedEvents);
    }
  }

  function getNextId() {
    return Math.max(...events.map(e => e.id)) + 1;
  }

  function addEvent() {
    const lastEvent = events[events.length - 1];
    const newEvent = {
      id: getNextId(),
      name: "New Event",
      duration: 60 * 60 * 1000, // 1 hour
      start: new Date(lastEvent.start.getTime() + lastEvent.duration),
      locked: false
    };
    eventsStore.set([...events, newEvent]);
  }

  function toggleLink(event) {
    const eventIndex = events.findIndex(e => e.id === event.id);
    if (eventIndex === -1 || eventIndex === events.length - 1) return;

    let updatedEvents = [...events];
    const nextEvent = events[eventIndex + 1];

    if (nextEvent.name === SEPARATOR_NAME) {
      // Удаляем разделитель
      updatedEvents.splice(eventIndex + 1, 1);
    } else {
      // Добавляем разделитель и состыковываем события
      const separator = {
        id: -Math.abs(getNextId()),
        name: SEPARATOR_NAME,
        duration: -1,
        start: new Date(event.start.getTime() + event.duration),
        locked: false
      };
      updatedEvents.splice(eventIndex + 1, 0, separator);

      // Состыковываем следующее событие
      const nextEventIndex = eventIndex + 2;
      if (!updatedEvents[nextEventIndex].locked) {
        updatedEvents[nextEventIndex].start = new Date(
          updatedEvents[eventIndex].start.getTime() + updatedEvents[eventIndex].duration
        );
      }
    }

    eventsStore.set(updatedEvents);
  }

  function deleteEvent(event) {
    if (events.length <= 1 || event.locked) return; // Не удаляем последнее или заблокированное событие
    const eventIndex = events.findIndex(e => e.id === event.id);
    if (eventIndex === -1) return;

    let updatedEvents = events.filter(e => e.id !== event.id);
    
    // Удаляем связанные разделители
    if (eventIndex > 0 && events[eventIndex - 1].name === SEPARATOR_NAME) {
      updatedEvents = updatedEvents.filter(e => e.id !== events[eventIndex - 1].id);
    }
    if (eventIndex < events.length - 1 && events[eventIndex + 1].name === SEPARATOR_NAME) {
      updatedEvents = updatedEvents.filter(e => e.id !== events[eventIndex + 1].id);
    }
    
    // Пересчитываем цепочку после удаления
    for (let i = 0; i < updatedEvents.length - 1; i++) {
      if (updatedEvents[i].name !== SEPARATOR_NAME && !updatedEvents[i].locked) {
        const nextIndex = updatedEvents.findIndex((e, idx) => idx > i && e.name !== SEPARATOR_NAME);
        if (nextIndex !== -1 && !updatedEvents[nextIndex].locked) {
          updatedEvents[nextIndex].start = new Date(
            updatedEvents[i].start.getTime() + updatedEvents[i].duration
          );
        }
      }
    }
    
    eventsStore.set(updatedEvents);
  }
</script>

<div class="table-container">
  <table>
    <thead>
      <tr>
        <th>Event Name</th>
        <th>Start Time</th>
        <th>Duration (min)</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>
      {#each events as event, index}
        {#if event.name !== SEPARATOR_NAME}
          <tr class:locked={event.locked}>
            <td>
              <input 
                type="text" 
                value={event.name}
                on:input={(e) => updateName(event, e.target.value)}
                disabled={event.locked}
              />
            </td>
            <td>
              <input 
                type="time"
                value={formatTimeForInput(event.start)}
                on:input={(e) => updateStartTime(event, e.target.value)}
                disabled={event.locked}
              />
            </td>
            <td>
              <input 
                type="number" 
                value={formatDuration(event.duration)}
                on:input={(e) => updateDuration(event, e.target.value)}
                min="1"
                disabled={event.locked}
              />
            </td>
            <td>
              <button 
                on:click={() => deleteEvent(event)}
                disabled={events.length <= 1 || event.locked}
                class="delete-btn"
              >
                ✕
              </button>
              {#if index < events.length - 1}
                <button 
                  on:click={() => toggleLink(event)}
                  class="link-btn"
                  class:linked={index + 1 < events.length && events[index + 1]?.name === SEPARATOR_NAME}
                  disabled={event.locked}
                >
                  🔗
                </button>
              {/if}
              <button 
                on:click={() => toggleLock(event)}
                class="lock-btn"
                class:locked={event.locked}
              >
                {event.locked ? '🔒' : '🔓'}
              </button>
            </td>
          </tr>
        {/if}
      {/each}
    </tbody>
  </table>
  <button on:click={addEvent} class="add-btn">Add Event</button>
</div>

<style>
  .table-container {
    margin-top: 20px;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 10px;
  }

  th, td {
    padding: 8px;
    text-align: left;
    border: 1px solid #ddd;
  }

  th {
    background-color: #f5f5f5;
  }

  input {
    width: 100%;
    padding: 4px;
    border: 1px solid #ddd;
    border-radius: 3px;
  }

  input[type="number"], input[type="time"] {
    width: 80px;
  }

  input:disabled {
    background-color: #f5f5f5;
    cursor: not-allowed;
  }

  .delete-btn, .link-btn, .lock-btn {
    background-color: #ff4444;
    color: white;
    border: none;
    border-radius: 3px;
    padding: 4px 8px;
    cursor: pointer;
    margin-right: 4px;
  }

  .link-btn {
    background-color: #666;
  }

  .lock-btn {
    background-color: #666;
  }

  .link-btn.linked {
    background-color: #4CAF50;
  }

  .lock-btn.locked {
    background-color: #ff9800;
  }

  .delete-btn:hover {
    background-color: #cc0000;
  }

  .link-btn:hover {
    background-color: #555;
  }

  .link-btn.linked:hover {
    background-color: #45a049;
  }

  .lock-btn:hover {
    background-color: #555;
  }

  .lock-btn.locked:hover {
    background-color: #f57c00;
  }

  .delete-btn:disabled, .link-btn:disabled {
    background-color: #cccccc;
    cursor: not-allowed;
  }

  tr.locked {
    background-color: #fff3e0;
  }

  .add-btn {
    background-color: #4CAF50;
    color: white;
    border: none;
    border-radius: 3px;
    padding: 8px 16px;
    cursor: pointer;
  }

  .add-btn:hover {
    background-color: #45a049;
  }
</style> 