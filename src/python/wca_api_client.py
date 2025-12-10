"""
WCA REST API Client
Uses static JSON files from: https://github.com/robiningelbrecht/wca-rest-api
"""

import requests


class WCAApiClient:
    """Client for WCA REST API (static JSON files)"""
    
    BASE_URL = "https://raw.githubusercontent.com/robiningelbrecht/wca-rest-api/master/api"
    
    def __init__(self):
        self.session = requests.Session()
        self._cache = {}
    
    def _get_json(self, path):
        """Get JSON from path with caching"""
        if path in self._cache:
            return self._cache[path]
        
        url = f"{self.BASE_URL}/{path}"
        
        try:
            response = self.session.get(url, timeout=30)
            response.raise_for_status()
            data = response.json()
            self._cache[path] = data
            return data
        except Exception as e:
            print(f"Error fetching {path}: {e}")
            return None
    
    # General endpoints
    def get_continents(self):
        """Get list of continents"""
        data = self._get_json('continents.json')
        return data.get('items', []) if data else []
    
    def get_countries(self):
        """Get list of countries"""
        data = self._get_json('countries.json')
        return data.get('items', []) if data else []
    
    def get_events(self):
        """Get list of events"""
        data = self._get_json('events.json')
        return data.get('items', []) if data else []
    
    # Rankings endpoints
    def get_rankings(self, region='world', type='single', event='333'):
        """
        Get rankings
        
        Args:
            region: 'world', continent id, or country code
            type: 'single' or 'average'
            event: Event ID (333, 222, etc.)
        """
        path = f"rank/{region}/{type}/{event}.json"
        data = self._get_json(path)
        return data.get('items', []) if data else []
    
    # Person endpoints
    def get_person(self, wca_id):
        """Get person by WCA ID"""
        path = f"persons/{wca_id}.json"
        data = self._get_json(path)
        return data if data else None
    
    # Helper methods
    def get_world_record(self, event='333', type='single'):
        """Get world record (first in world rankings)"""
        rankings = self.get_rankings('world', type, event)
        
        if rankings and len(rankings) > 0:
            wr = rankings[0]
            
            # Get person details to get name
            person_id = wr.get('personId')
            person = self.get_person(person_id) if person_id else None
            
            return {
                'time_seconds': wr.get('best', 0) / 100,
                'holder': person.get('name', 'Unknown') if person else person_id,
                'wca_id': person_id,
                'country': person.get('country', 'Unknown') if person else 'Unknown',
                'world_rank': wr.get('rank', {}).get('world', 1)
            }
        
        return None
    
    def estimate_percentile(self, time_seconds, event='333', type='single', region='world'):
        """
        Estimate percentile by comparing to rankings
        
        Args:
            time_seconds: Your time in seconds
            event: Event ID
            type: 'single' or 'average'  
            region: 'world', continent, or country
        """
        print(f"  Fetching {region} {type} rankings for {event}...")
        
        rankings = self.get_rankings(region, type, event)
        
        if not rankings:
            print("  Rankings unavailable, using approximate statistics...")
            return self._approximate_percentile(time_seconds)
        
        print(f"  Loaded {len(rankings):,} ranked competitors...")
        
        # Extract times from rankings
        times = []
        for rank_data in rankings:
            result = rank_data.get('best', 0)
            if result > 0:
                times.append(result / 100)  # Convert centiseconds to seconds
        
        if not times:
            return self._approximate_percentile(time_seconds)
        
        # Calculate percentile
        faster_count = sum(1 for t in times if t < time_seconds)
        total_ranked = len(times)
        percentile = (faster_count / total_ranked) * 100
        
        return {
            'percentile': percentile,
            'faster_than': f"{percentile:.1f}%",
            'rank_estimate': faster_count + 1,
            'total_ranked': total_ranked,
            'note': f'Compared to {total_ranked:,} ranked competitors ({region})'
        }
    
    def _approximate_percentile(self, time_seconds):
        """Fallback: Approximate percentile"""
        percentile_map = {
            6: (0.01, "Elite (World-class)"),
            8: (0.1, "Elite (National champion level)"),
            10: (1, "Advanced (Continental finalist)"),
            12: (5, "Advanced (Regional finalist)"),
            15: (15, "Intermediate (Very fast)"),
            20: (40, "Intermediate (Fast)"),
            25: (60, "Beginner-Intermediate (Above average)"),
            30: (75, "Beginner (Average competitor)"),
            40: (90, "Beginner (Learning)")
        }
        
        for threshold, (pct, desc) in sorted(percentile_map.items()):
            if time_seconds <= threshold:
                return {
                    'percentile': pct,
                    'faster_than': f"{pct:.1f}%",
                    'description': desc,
                    'rank_estimate': 'N/A',
                    'total_ranked': 'N/A',
                    'note': 'Approximate statistical estimate'
                }
        
        return {
            'percentile': 95,
            'faster_than': "95%+",
            'description': "Beginner",
            'rank_estimate': 'N/A',
            'total_ranked': 'N/A',
            'note': 'Approximate statistical estimate'
        }


def main():
    """Test WCA API client"""
    print("="*60)
    print("WCA API CLIENT TEST")
    print("="*60)
    
    client = WCAApiClient()
    
    # Test 1: Events
    print("\n1. Available Events:")
    events = client.get_events()
    if events:
        for event in events[:10]:
            print(f"  {event.get('id')}: {event.get('name')}")
    
    # Test 2: World Records
    print("\n2. 3x3x3 World Records:")
    wr_single = client.get_world_record('333', 'single')
    if wr_single:
        print(f"  Single: {wr_single['time_seconds']:.2f}s by {wr_single['holder']} ({wr_single['country']})")
    
    wr_avg = client.get_world_record('333', 'average')
    if wr_avg:
        print(f"  Average: {wr_avg['time_seconds']:.2f}s by {wr_avg['holder']} ({wr_avg['country']})")
    
    # Test 3: Top 5 Rankings
    print("\n3. Top 5 Rankings (3x3x3 Single):")
    rankings = client.get_rankings('world', 'single', '333')
    if rankings:
        for rank in rankings[:5]:
            time_s = rank.get('best', 0) / 100
            person_id = rank.get('personId', 'Unknown')
            
            # Get person details
            person = client.get_person(person_id)
            name = person.get('name', person_id) if person else person_id
            country = person.get('country', 'Unknown') if person else 'Unknown'
            world_rank = rank.get('rank', {}).get('world', '?')
            
            print(f"  #{world_rank}. {name} ({country}): {time_s:.2f}s")
    
    # Test 4: Percentile estimation
    print("\n4. Percentile Estimation:")
    test_times = [8.0, 12.0, 18.0]
    for time in test_times:
        result = client.estimate_percentile(time, '333', 'single')
        print(f"  {time}s → Rank ~{result['rank_estimate']} ({result['faster_than']})")
    
    print("\n✓ API client test complete!")


if __name__ == "__main__":
    main()