<script>
  import { onMount } from "svelte";
  import { eventsStore, SEPARATOR_NAME } from "../stores/events";

  let container;
  let timeline;
  let events;
  let isInitialized = false;
  let items;
  let groups;

  const MINUTE = 60 * 1000;

  eventsStore.subscribe(value => {
    events = sortEventsByTime(value);
    if (isInitialized && items) {
      updateTimelineItems();
    }
  });

  function formatDuration(ms) {
    return Math.round(ms / 1000 / 60) + " min";
  }

  function roundToMinute(date) {
    const copy = new Date(date);
    copy.setSeconds(0, 0);
    return copy;
  }

  function checkOverlap(events, movedEventIndex, newStartTime, newDuration) {
    const movedEvent = events[movedEventIndex];
    const newEndTime = new Date(newStartTime.getTime() + (newDuration || movedEvent.duration));

    // Получаем все события, кроме разделителей и перемещаемого события
    const otherEvents = events.filter((e, i) => 
      e.name !== SEPARATOR_NAME && 
      i !== movedEventIndex && 
      !isEventInChain(events, movedEventIndex, i)
    );

    // Проверяем пересечение с каждым событием
    for (const event of otherEvents) {
      const eventEnd = new Date(event.start.getTime() + event.duration);
      if (
        (newStartTime >= event.start && newStartTime < eventEnd) || // Начало накладывается
        (newEndTime > event.start && newEndTime <= eventEnd) || // Конец накладывается
        (newStartTime <= event.start && newEndTime >= eventEnd) // Полное перекрытие
      ) {
        return true;
      }
    }

    return false;
  }

  function isEventInChain(events, sourceIndex, targetIndex) {
    // Проверяем, связаны ли события через разделители
    let currentIndex = sourceIndex;
    
    // Проверяем вперед
    while (currentIndex < events.length - 2) {
      if (events[currentIndex + 1].name === SEPARATOR_NAME) {
        currentIndex += 2;
        if (currentIndex === targetIndex) return true;
      } else {
        break;
      }
    }

    // Проверяем назад
    currentIndex = sourceIndex;
    while (currentIndex > 1) {
      if (events[currentIndex - 1].name === SEPARATOR_NAME) {
        currentIndex -= 2;
        if (currentIndex === targetIndex) return true;
      } else {
        break;
      }
    }

    return false;
  }

  function isEventMovable(events, eventIndex) {
    // Проверяем само событие
    if (events[eventIndex].locked) return false;

    // Проверяем связанные события вперед
    let currentIndex = eventIndex;
    while (currentIndex < events.length - 2) {
      if (events[currentIndex + 1].name === SEPARATOR_NAME) {
        // Есть разделитель, проверяем следующее событие
        if (events[currentIndex + 2].locked) return false;
        currentIndex += 2;
      } else {
        break;
      }
    }

    // Проверяем связанные события назад
    currentIndex = eventIndex;
    while (currentIndex > 1) {
      if (events[currentIndex - 1].name === SEPARATOR_NAME) {
        // Есть разделитель, проверяем предыдущее событие
        if (events[currentIndex - 2].locked) return false;
        currentIndex -= 2;
      } else {
        break;
      }
    }

    return true;
  }

  function sortEventsByTime(events) {
    // Find all chains (including single events)
    const chains = [];
    let currentChain = [];
    
    for (let i = 0; i < events.length; i++) {
      currentChain.push(events[i]);
      
      // If this is a single event or end of chain
      if (i === events.length - 1 || events[i + 1].name !== SEPARATOR_NAME) {
        if (currentChain.length > 0) {
          chains.push([...currentChain]);
          currentChain = [];
        }
      }
    }
    
    // Sort chains by their first event's start time
    chains.sort((a, b) => {
      const aStart = a[0].start.getTime();
      const bStart = b[0].start.getTime();
      return aStart - bStart;
    });
    
    // Flatten chains back into a single array
    return chains.flat();
  }

  function updateTimelineItems() {
    if (!events || !items) return;
    
    const updates = events
      .filter(event => event.name !== SEPARATOR_NAME)
      .map(event => {
        const eventIndex = events.findIndex(e => e.id === event.id);
        const movable = isEventMovable(events, eventIndex);
        return {
          id: event.id,
          content: `${event.name} (${formatDuration(event.duration)})`,
          start: event.start,
          end: new Date(event.start.getTime() + event.duration),
          className: `${event.id === 1 ? "main-item" : "linked-item"} ${!movable ? "vis-readonly" : ""}`,
          type: "range",
          group: 1,
          editable: {
            updateTime: movable,
            remove: false
          }
        };
      });

    try {
      items.clear();
      items.add(updates);
    } catch (error) {
      console.error("Error updating timeline:", error);
    }
  }

  function recalculateChain(events, movedEventIndex, newStartTime, newDuration = null) {
    // Проверяем, можно ли двигать событие
    if (!isEventMovable(events, movedEventIndex)) return events;

    // Проверяем наложение
    if (checkOverlap(events, movedEventIndex, newStartTime, newDuration)) {
      return events;
    }

    let updatedEvents = [...events];
    
    // Обновляем длительность перемещаемого события
    if (newDuration !== null) {
      const roundedDuration = Math.round(newDuration / MINUTE) * MINUTE;
      updatedEvents[movedEventIndex].duration = roundedDuration;
    }

    // Обновляем позицию перемещаемого события
    updatedEvents[movedEventIndex].start = roundToMinute(newStartTime);

    // Проверяем и обновляем связанные события
    let currentIndex = movedEventIndex;
    
    // Двигаем связанные события вперед
    while (currentIndex < events.length - 2) {
      if (events[currentIndex + 1].name === SEPARATOR_NAME) {
        // Есть разделитель, двигаем следующее событие
        const nextEventIndex = currentIndex + 2;
        updatedEvents[nextEventIndex].start = new Date(
          updatedEvents[currentIndex].start.getTime() + updatedEvents[currentIndex].duration
        );
        currentIndex = nextEventIndex;
      } else {
        break;
      }
    }

    // Двигаем связанные события назад
    currentIndex = movedEventIndex;
    while (currentIndex > 1) {
      if (events[currentIndex - 1].name === SEPARATOR_NAME) {
        // Есть разделитель, двигаем предыдущее событие
        const prevEventIndex = currentIndex - 2;
        if (prevEventIndex >= 0) {
          updatedEvents[prevEventIndex].start = new Date(
            updatedEvents[currentIndex].start.getTime() - updatedEvents[prevEventIndex].duration
          );
          currentIndex = prevEventIndex;
        }
      } else {
        break;
      }
    }

    return updatedEvents;
  }

  function initializeTimeline() {
    if (!window.vis) {
      setTimeout(initializeTimeline, 100);
      return;
    }

    items = new window.vis.DataSet();
    groups = new window.vis.DataSet([{ id: 1, content: "" }]);

    const options = {
      editable: {
        updateTime: true,
        updateGroup: false,
        overrideItems: true
      },
      stack: false,
      margin: { item: { horizontal: 0 } },
      rollingMode: { follow: false },
      snap: (date) => roundToMinute(date),
      onMoving: function(item, callback) {
        const movedEventIndex = events.findIndex(event => event.id === item.id);
        if (movedEventIndex !== -1) {
          // Проверяем, можно ли двигать событие
          if (!isEventMovable(events, movedEventIndex)) {
            callback(null); // Отменяем перемещение
            return;
          }

          const newDuration = item.end - item.start;
          const newStart = item.start;

          // Проверяем наложение
          if (checkOverlap(events, movedEventIndex, newStart, newDuration)) {
            callback(null); // Отменяем перемещение
            return;
          }

          const updatedEvents = recalculateChain(events, movedEventIndex, newStart, newDuration);
          
          item.content = `${updatedEvents[movedEventIndex].name} (${formatDuration(newDuration)})`;
          eventsStore.set(updatedEvents);
        }
        callback(item);
      }
    };

    timeline = new window.vis.Timeline(container, items, groups, options);
    isInitialized = true;

    // Инициализируем элементы после создания таймлайна
    updateTimelineItems();

    // Устанавливаем окно просмотра
    if (events && events.length > 0) {
      // Find min and max times across all events
      const minTime = Math.min(...events
        .filter(event => event.name !== SEPARATOR_NAME)
        .map(event => event.start.getTime()));
      const maxTime = Math.max(...events
        .filter(event => event.name !== SEPARATOR_NAME)
        .map(event => event.start.getTime() + event.duration));
      
      const timeRange = maxTime - minTime;
      const padding = timeRange * 0.1; // 10% padding

      timeline.setWindow(
        new Date(minTime - padding),
        new Date(maxTime + padding)
      );
    }
  }

  onMount(() => {
    initializeTimeline();
    return () => {
      if (timeline) {
        timeline.destroy();
      }
    };
  });
</script>

<div bind:this={container} class="timeline"></div>

<style>
  .timeline {
    width: 100%;
    height: 200px;
    border: 1px solid lightgray;
  }

  :global(.vis-item.linked-item) {
    background-color: #97c2fc;
    border-color: #2b7ce9;
  }

  :global(.vis-item.main-item) {
    background-color: #ffb366;
    border-color: #ff7f00;
  }

  :global(.vis-item:hover) {
    box-shadow: 0 0 10px rgba(0,0,0,0.2);
    z-index: 2;
  }

  :global(.vis-item.vis-selected) {
    background-color: #d5e8ff;
    border-color: #2196F3;
  }

  :global(.vis-item.vis-readonly) {
    background-color: #fff3e0;
    cursor: not-allowed;
  }
</style>