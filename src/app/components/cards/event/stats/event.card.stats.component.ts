import {ChangeDetectionStrategy, Component, Input, OnChanges} from '@angular/core';
import {MatTableDataSource} from '@angular/material';
import {EventInterface} from 'quantified-self-lib/lib/events/event.interface';
import {ActivityInterface} from 'quantified-self-lib/lib/activities/activity.interface';
import {DataInterface} from 'quantified-self-lib/lib/data/data.interface';

@Component({
  selector: 'app-event-card-stats',
  templateUrl: './event.card.stats.component.html',
  styleUrls: ['./event.card.stats.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})

export class EventCardStatsComponent implements OnChanges {
  @Input() event: EventInterface;
  @Input() selectedActivites: ActivityInterface[];
  data: MatTableDataSource<Object>;
  columns: Array<Object>;

  ngOnChanges() {
    if (!this.selectedActivites.length) {
      this.data = new MatTableDataSource<Object>();
      this.columns = [];
      return;
    }

    // Collect all the stat types from all the activities
    const stats = this.selectedActivites.reduce((statsMap, activity) => {
      Array.from(activity.getStats().values()).forEach((stat) => {
        statsMap.set(stat.getClassName(), stat);
      });
      return statsMap;
    }, new Map<string, DataInterface>());

    // Create the data as rows
    const data = Array.from(stats.values()).reduce((array, stat) => {
      array.push(
        this.selectedActivites.reduce((rowObj, activity, index) => {
          const activityStat = activity.getStat(stat.getClassName());
          if (!activityStat) {
            return rowObj;
          }
          rowObj[activity.creator.name] =
            (activityStat ? activityStat.getDisplayValue() : '') +
            ' ' +
            (activityStat ? activityStat.getDisplayUnit() : '');
          return rowObj;
        }, {Name: stat.getType()}),
      );
      return array;
    }, []);

    // If we are comparing only 2 activities then add a diff column.
    // @todo support more than 2 activities for diff
    if (this.selectedActivites.length === 2) {
      Array.from(stats.values()).forEach((stat: DataInterface, index) => {
        const firstActivityStat = this.selectedActivites[0].getStat(stat.getClassName());
        const secondActivityStat = this.selectedActivites[1].getStat(stat.getClassName());
        if (!firstActivityStat || !secondActivityStat) {
          return;
        }
        const firstActivityStatValue = firstActivityStat.getValue();
        const secondActivityStatValue = secondActivityStat.getValue();
        if (typeof firstActivityStatValue !== 'number' || typeof secondActivityStatValue !== 'number') {
          return;
        }
        data[index]['Difference'] = Math.round(100 * Math.abs((firstActivityStatValue - secondActivityStatValue) / ((firstActivityStatValue + secondActivityStatValue) / 2))) + '%';
        // Correct the NaN with both 0's
        if (firstActivityStatValue === 0 && secondActivityStatValue === 0){
          data[index]['Difference'] = 0 + '%'
        }
      })
    }

    // Get the columns
    this.columns = (Object.keys(data[0]));
    // Set the data
    this.data = new MatTableDataSource(data);
  }

  applyFilter(filterValue: string) {
    filterValue = filterValue.trim(); // Remove whitespace
    filterValue = filterValue.toLowerCase(); // MatTableDataSource defaults to lowercase matches
    this.data.filter = filterValue;
  }
}
