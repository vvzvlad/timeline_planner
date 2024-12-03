<script>
  import { onMount } from "svelte";
  import { eventsStore, SEPARATOR_NAME } from "../stores/events";
  import { selectedTimezone } from "../stores/timezone";

  let container;
  let timeline;
  let events;
  let isInitialized = false;
  let items;
  let groups;
  let currentTimezone;

  const MINUTE = 60 * 1000;

  eventsStore.subscribe((value) => {
    events = sortEventsByTime(value);
    if (isInitialized && items) {
      updateTimelineItems();
    }
  });

  selectedTimezone.subscribe((timezone) => {
    currentTimezone = timezone;
    if (isInitialized && timeline) {
      updateTimelineCustomTime();
    }
  });

  function formatDuration(ms) {
    const minutes = Math.round(ms / 1000 / 60);
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    if (hours === 0) {
      return `${minutes} min`;
    } else if (remainingMinutes === 0) {
      return `${hours} h`;
    } else {
      return `${hours} h ${remainingMinutes} min`;
    }
  }

  function roundToMinute(date) {
    const copy = new Date(date);
    copy.setSeconds(0, 0);
    return copy;
  }

  function checkOverlap(events, movedEventIndex, newStartTime, newDuration) {
    const movedEvent = events[movedEventIndex];
    const newEndTime = new Date(
      newStartTime.getTime() + (newDuration || movedEvent.duration)
    );

    // Get all events except separators and the moved event
    const otherEvents = events.filter(
      (e, i) =>
        e.name !== SEPARATOR_NAME &&
        i !== movedEventIndex &&
        !isEventInChain(events, movedEventIndex, i)
    );

    // Check for overlap with each event
    for (const event of otherEvents) {
      const eventEnd = new Date(event.start.getTime() + event.duration);
      if (
        (newStartTime >= event.start && newStartTime < eventEnd) || // Start overlaps
        (newEndTime > event.start && newEndTime <= eventEnd) || // End overlaps
        (newStartTime <= event.start && newEndTime >= eventEnd) // Full overlap
      ) {
        return true;
      }
    }

    return false;
  }

  function isEventInChain(events, sourceIndex, targetIndex) {
    // Check if events are linked through separators
    let currentIndex = sourceIndex;

    // Check forward
    while (currentIndex < events.length - 2) {
      if (events[currentIndex + 1].name === SEPARATOR_NAME) {
        currentIndex += 2;
        if (currentIndex === targetIndex) return true;
      } else {
        break;
      }
    }

    // Check backward
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
    // Check the event itself
    if (events[eventIndex].locked) return false;

    // Check linked events forward
    let currentIndex = eventIndex;
    while (currentIndex < events.length - 2) {
      if (events[currentIndex + 1].name === SEPARATOR_NAME) {
        // There is a separator, check the next event
        if (events[currentIndex + 2].locked) return false;
        currentIndex += 2;
      } else {
        break;
      }
    }

    // Check linked events backward
    currentIndex = eventIndex;
    while (currentIndex > 1) {
      if (events[currentIndex - 1].name === SEPARATOR_NAME) {
        // There is a separator, check the previous event
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
      .filter((event) => event.name !== SEPARATOR_NAME)
      .map((event) => {
        const eventIndex = events.findIndex((e) => e.id === event.id);
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
            remove: false,
          },
        };
      });

    try {
      items.clear();
      items.add(updates);
    } catch (error) {
      console.error("Error updating timeline:", error);
    }
  }

  function recalculateChain(
    events,
    movedEventIndex,
    newStartTime,
    newDuration = null
  ) {
    // Check if event can be moved
    if (!isEventMovable(events, movedEventIndex)) return events;

    // Check for overlapping
    if (checkOverlap(events, movedEventIndex, newStartTime, newDuration)) {
      return events;
    }

    let updatedEvents = [...events];

    // Update duration of the moved event
    if (newDuration !== null) {
      const roundedDuration = Math.round(newDuration / MINUTE) * MINUTE;
      updatedEvents[movedEventIndex].duration = roundedDuration;
    }

    // Update position of the moved event
    updatedEvents[movedEventIndex].start = roundToMinute(newStartTime);

    // Check and update linked events
    let currentIndex = movedEventIndex;

    // Move linked events forward
    while (currentIndex < events.length - 2) {
      if (events[currentIndex + 1].name === SEPARATOR_NAME) {
        // There is a separator, move the next event
        const nextEventIndex = currentIndex + 2;
        updatedEvents[nextEventIndex].start = new Date(
          updatedEvents[currentIndex].start.getTime() +
            updatedEvents[currentIndex].duration
        );
        currentIndex = nextEventIndex;
      } else {
        break;
      }
    }

    // Move linked events backward
    currentIndex = movedEventIndex;
    while (currentIndex > 1) {
      if (events[currentIndex - 1].name === SEPARATOR_NAME) {
        // There is a separator, move the previous event
        const prevEventIndex = currentIndex - 2;
        if (prevEventIndex >= 0) {
          updatedEvents[prevEventIndex].start = new Date(
            updatedEvents[currentIndex].start.getTime() -
              updatedEvents[prevEventIndex].duration
          );
          currentIndex = prevEventIndex;
        }
      } else {
        break;
      }
    }

    return updatedEvents;
  }

  // Список часовых поясов с UTC смещением
  const timezones = [
    'UTC+00:00 (Лондон)',
    'UTC+01:00 (Париж)',
    'UTC+02:00 (Киев)',
    'UTC+03:00 (Москва)',
    'UTC+04:00 (Дубай)',
    'UTC+05:00 (Челябинск, Ташкент)',
    'UTC+06:00 (Астана)',
    'UTC+07:00 (Бангкок)',
    'UTC+08:00 (Пекин)',
    'UTC+09:00 (Токио, Токио)',
    'UTC+10:00 (Владивосток)',
    'UTC+11:00 (Сахалин)',
    'UTC+12:00 (Окленд)',
    'UTC-11:00 (Гавайи)',
    'UTC-10:00 (Гавайи)',
    'UTC-09:00 (Аляска)',
    'UTC-08:00 (Лос-Анджелес)',
    'UTC-07:00 (Лас-Вегас)',
    'UTC-06:00 (Чикаго)',
    'UTC-05:00 (Нью-Йорк)',
    'UTC-04:00 (Сан-Франциско)',
    'UTC-03:00 (Сан-Паулу)',
    'UTC-02:00 (Азорские острова)',
    'UTC-01:00 (Азорские острова)'
  ];

  function getUtcOffset(timezone) {
    const match = timezone.match(/UTC([+-]\d{2}):00/);
    return match ? parseInt(match[1]) : 0;
  }

  function updateTimelineCustomTime() {
    const options = {
      moment: function(date) {
        const offset = getUtcOffset($selectedTimezone);
        // @ts-ignore
        return window.moment(date).utcOffset(offset);
      }
    };
    
    timeline.setOptions(options);
    timeline.redraw();
  }

  function initializeTimeline() {
    // @ts-ignore
    if (!window.vis || !window.moment) {
      setTimeout(initializeTimeline, 100);
      return;
    }

    // @ts-ignore
    items = new window.vis.DataSet();
    // @ts-ignore
    groups = new window.vis.DataSet([{ id: 1, content: "" }]);

    const options = {
      editable: {
        updateTime: true,
        updateGroup: false,
        overrideItems: true,
      },
      stack: false,
      margin: { item: { horizontal: 0 } },
      rollingMode: { follow: false },
      snap: (date) => roundToMinute(date),
      onMoving: function (item, callback) {
        const movedEventIndex = events.findIndex(
          (event) => event.id === item.id
        );
        if (movedEventIndex !== -1) {
          // Check if event can be moved
          if (!isEventMovable(events, movedEventIndex)) {
            callback(null); // Cancel movement
            return;
          }

          const newDuration = item.end - item.start;
          const newStart = item.start;

          // Check for overlapping
          if (checkOverlap(events, movedEventIndex, newStart, newDuration)) {
            callback(null); // Cancel movement
            return;
          }

          const updatedEvents = recalculateChain(
            events,
            movedEventIndex,
            newStart,
            newDuration
          );

          item.content = `${updatedEvents[movedEventIndex].name} (${formatDuration(newDuration)})`;
          eventsStore.set(updatedEvents);
        }
        callback(item);
      },
      moment: function(date) {
        // @ts-ignore
        return window.moment(date).tz(currentTimezone);
      }
    };

    // @ts-ignore
    timeline = new window.vis.Timeline(container, items, groups, options);
    isInitialized = true;

    // Initialize items after timeline creation
    updateTimelineItems();

    // Set the view window
    if (events && events.length > 0) {
      // Find min and max times across all events
      const minTime = Math.min(
        ...events
          .filter((event) => event.name !== SEPARATOR_NAME)
          .map((event) => event.start.getTime())
      );
      const maxTime = Math.max(
        ...events
          .filter((event) => event.name !== SEPARATOR_NAME)
          .map((event) => event.start.getTime() + event.duration)
      );

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

<div class="timezone-selector">
  <select bind:value={$selectedTimezone}>
    {#each timezones as tz}
      <option value={tz}>{tz}</option>
    {/each}
  </select>
</div>

<div bind:this={container} class="timeline"></div>

<style>
  .timeline {
    width: 100%;
    height: 400px;
    border: 1px solid lightgray;
  }

  :global(.vis-item.linked-item) {
    background-color: #97c2fc;
    border-color: #2b7ce9;
    min-height: 100px !important;
    font-size: 12px;
    white-space: normal !important;
    word-wrap: break-word !important;
  }

  :global(.vis-item.main-item) {
    background-color: #ffb366;
    border-color: #ff7f00;
    min-height: 100px !important;
    font-size: 12px;
    white-space: normal !important;
    word-wrap: break-word !important;
  }

  :global(.vis-item:hover) {
    box-shadow: 0 0 10px rgba(0, 0, 0, 0.2);
    z-index: 2;
  }

  :global(.vis-item.vis-selected) {
    background-color: #d5e8ff;
    border-color: #2196f3;
  }

  :global(.vis-item.vis-readonly) {
    background-color: #fff3e0;
    cursor: not-allowed;
  }

  :global(.vis-item .vis-item-content) {
    padding: 4px 8px;
    white-space: normal !important;
    word-wrap: break-word !important;
  }

  .timezone-selector {
    margin-bottom: 1rem;
  }

  .timezone-selector select {
    padding: 0.5rem;
    border-radius: 4px;
    border: 1px solid #ccc;
  }
</style>
