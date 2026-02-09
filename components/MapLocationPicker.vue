<template>
  <div class="flex flex-col w-full h-full bg-gray-50">
    <!-- Search and Info Area -->
    <div class="py-3 border-b bg-white space-y-2">
      <div @click="openSearchModal">
        <UInput
          placeholder="Search..."
          icon="i-heroicons-magnifying-glass"
          readonly
          class="cursor-pointer"
        />
      </div>

      <div>
        <p class="text-xl font-semibold truncate">{{ name }}</p>
        <p class="text-gray-600 text-sm truncate">{{ formattedAddress }}</p>
      </div>

      <!-- Confirm Button -->
      <UButton
        v-if="selectedLocation"
        class="mt-2"
        color="primary"
        icon="i-heroicons-check-circle"
        @click="confirmLocation"
      >
        Confirm Location
      </UButton>
    </div>

    <!-- Map Area -->
    <div class="relative flex-1 min-h-[400px]">
      <div ref="mapContainer" class="absolute inset-0 z-0" />
      <UButton
        class="absolute z-10 left-4 bottom-4"
        icon="i-heroicons-map-pin"
        color="primary"
        size="md"
        @click="useCurrentLocation"
      >
        Use Current Location
      </UButton>
    </div>

    <!-- Manual Search Modal -->
    <USlideover v-model="isSearchModalOpen">
      <div class="p-4 space-y-4">
        <h2 class="text-lg font-semibold">Search Location</h2>

        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search location..."
          @input="handleSearchInput"
          class="w-full border border-gray-300 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
        />

        <div v-if="isSearching" class="text-center py-4">
          <span>Searching...</span>
        </div>

        <ul v-else-if="searchResults.length">
          <li
            v-for="(result, index) in searchResults"
            :key="index"
            class="p-2 cursor-pointer border-b hover:bg-gray-100"
            @click="selectPlace(result)"
          >
            <p class="font-semibold">{{ result.name }}</p>
            <p class="text-sm text-gray-500">{{ result.formatted_address }}</p>
          </li>
        </ul>

        <p v-else-if="searchQuery && !searchResults.length" class="text-sm text-gray-500 text-center">
          No results found
        </p>
      </div>
    </USlideover>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { UInput, UButton, USlideover } from '#components'

const emit = defineEmits(['locationSelected'])

const mapContainer = ref(null)
const isSearchModalOpen = ref(false)

const name = ref('')
const formattedAddress = ref('')
const selectedLocation = ref(null) // ✅ store latest selection

const searchQuery = ref('')
const searchResults = ref([])
const isSearching = ref(false)

let map, marker, geocoder, placesService

const useAuth = () => useNuxtApp().$auth

function useCurrentLocation() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords
        const location = { lat: latitude, lng: longitude }
        map.setCenter(location)
        map.setZoom(15)
        marker.setPosition(location)
        updateAddressFromMarker(location)
      },
      () => alert('Unable to retrieve your location.')
    )
  } else {
    alert('Geolocation is not supported by this browser.')
  }
}

function updateAddressFromMarker(pos) {
  if (geocoder) {
    geocoder.geocode({ location: pos }, (results, status) => {
      if (status === 'OK' && results && results.length > 0) {
        name.value = results[0].address_components?.[0]?.long_name || ''
        formattedAddress.value = results[0].formatted_address || ''
        selectedLocation.value = {
          pos,
          placeId: null,
          components: results[0].address_components || [],
          name: name.value,
          formattedAddress: formattedAddress.value,
        }
      } else {
        name.value = ''
        formattedAddress.value = ''
        selectedLocation.value = null
      }
    })
  }
}

function openSearchModal() {
  isSearchModalOpen.value = true
  searchQuery.value = ''
  searchResults.value = []
}

function handleSearchInput() {
  if (!searchQuery.value) {
    searchResults.value = []
    return
  }

  if (!placesService) return
  isSearching.value = true

  const request = {
    query: searchQuery.value,
    fields: ['address_components', 'geometry', 'formatted_address'],
    region: 'in',
    locationBias: {
      north: 37.6,
      south: 6.5,
      east: 97.25,
      west: 68.7,
    },
  }

  placesService.textSearch(request, (results, status) => {
    if (status === google.maps.places.PlacesServiceStatus.OK) {
      searchResults.value = results
    } else {
      searchResults.value = []
    }
    isSearching.value = false
  })
}

function selectPlace(place) {
  if (!place.place_id) return

  const request = {
    placeId: place.place_id,
    fields: ['name', 'formatted_address', 'geometry', 'address_components'],
  }

  placesService.getDetails(request, (details, status) => {
    if (status !== google.maps.places.PlacesServiceStatus.OK || !details) {
      console.error('Failed to get place details')
      return
    }

    const location = details.geometry.location
    map.setCenter(location)
    map.setZoom(15)
    marker.setPosition(location)

    const pos = { lat: location.lat(), lng: location.lng() }
    name.value = details.name
    formattedAddress.value = details.formatted_address

    selectedLocation.value = {
      pos,
      placeId: place.place_id,
      components: details.address_components || [],
      name: name.value,
      formattedAddress: formattedAddress.value,
    }

    isSearchModalOpen.value = false
  })
}

function confirmLocation() {
  if (!selectedLocation.value) return

  const { pos, placeId, components, name: locName, formattedAddress: addr } =
    selectedLocation.value

  const getComponent = (types) =>
    components.find((c) => types.every((t) => c.types.includes(t)))?.long_name || ''

  const street = getComponent(['route'])
  const locality = getComponent(['sublocality', 'sublocality_level_1'])
  const city = getComponent(['locality']) || getComponent(['administrative_area_level_2'])
  const state = getComponent(['administrative_area_level_1'])
  const pincode = getComponent(['postal_code'])

  emit('locationSelected', {
    lat: pos.lat,
    lng: pos.lng,
    name: locName,
    formattedAddress: addr,
    street,
    locality,
    city,
    state,
    pincode,
    placeId,
  })
}

function initMap() {
  geocoder = new google.maps.Geocoder()
  map = new google.maps.Map(mapContainer.value, {
    center: { lat: 20.5937, lng: 78.9629 },
    zoom: 5,
    mapId: '85423aee1b59e235e896d3e7',
  })

  placesService = new google.maps.places.PlacesService(map)

  marker = new google.maps.Marker({
    map,
    draggable: true,
  })

  marker.addListener('dragend', () => {
    updateAddressFromMarker(marker.getPosition().toJSON())
  })

  map.addListener('click', (e) => {
    marker.setPosition(e.latLng)
    updateAddressFromMarker(e.latLng.toJSON())
  })

  // ✅ Prefer saved session address if available
  const savedLat = useAuth().session.value?.address.lat
  const savedLng = useAuth().session.value?.address.lng

  if (savedLat && savedLng) {
    const location = { lat: savedLat, lng: savedLng }
    map.setCenter(location)
    map.setZoom(15)
    marker.setPosition(location)
    updateAddressFromMarker(location)
  } else {
    useCurrentLocation()
  }
}

onMounted(() => {
  if (typeof google !== 'undefined' && google.maps) {
    initMap()
  } else {
    const script = document.createElement('script')
    script.src =
      'https://maps.googleapis.com/maps/api/js?key=AIzaSyCfmQAcnCd3rUdLXxC9Hg9NiowG0ovHbfQ&libraries=places'
    script.async = true
    script.defer = true
    script.onload = initMap
    document.head.appendChild(script)
  }
})
</script>
