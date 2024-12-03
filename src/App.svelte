<script>
  import Timeline from "./components/Timeline.svelte";
  import EventsTable from "./components/EventsTable.svelte";
  import { eventsStore } from "./stores/events";

  let events;
  eventsStore.subscribe(value => {
    events = value;
  });
</script>

<main>
  <Timeline />
  <EventsTable {events} />
</main>

<style>
  main {
    padding: 20px;
  }
</style>
