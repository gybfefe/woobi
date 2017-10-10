import React from 'react';
import moment from 'moment';
import Debug from 'debug';
import { sortBy, find } from 'lodash';
import Gab from '../../common/gab';
import Table from '../../common/components/table';
import { Card, CardActions, CardHeader, CardMedia, CardTitle, CardText, DropDownMenu, FlatButton, FontIcon, IconButton, IconMenu, LinearProgress, MenuItem, Toggle, Toolbar, ToolbarGroup, ToolbarSeparator, ToolbarTitle } from 'material-ui';
import { Styles } from '../../common/styles';
import { ColorMe } from '../../common/utils';

let debug = Debug('woobi:app:pages:epg:channels');

export default class Timers extends React.Component {
	constructor(props) {
		super(props)
		this.displayName = 'Timers';
		this.state = {
			selected: []
		};	
	}
	
	componentDidMount ( ) {
		debug('######### componentDidMount  ##  Timers',  this.props);
	}
	
	componentWillUnmount ( ) {
	}
	
	componentWillReceiveProps ( props ) {
		debug('## componentWillReceiveProps  ## Timers got props', props);
		this._update = true;
		this.setState({ selected: [] });
	}	
	
	shouldComponentUpdate ( ) {
		debug('should Timers update', this._update);
		if(this._update) {
			this._update = false;
			return true;
		}
		return false;
	}
	
	handleExpandChange = ( expanded ) => {
		this.setState({expanded: expanded});
	};
	
	renderSchedule ( s ) {
		let fields = [
			{
				field: 'startTime',
				label: 'Time' ,
				style: { fontSize: 11 }, 
				print: (v, list, obj) => {
					return (<span>{moment.unix(v).format('L LT')} - {moment.unix(obj.endTime).format('LT')}</span>);
				} 
			},
			{ 
				field: 'name',
				label: 'Show' , 
				style: { fontSize: 11 }, 
			},
			{ 
				field: 'info',
				label: 'Outline' , 
				style: { fontSize: 11 }, 
			},
			{ 
				field: 'channelId',
				label: 'Channel' , 
				style: { fontSize: 11 }, 
				print: (v, list, obj) => {
					return (find(this.props.channels, ['channelId',v]).channelName);
				} 
			},
		];
		return (
			<Table 
				fields={fields} 
				list={ s } 
				selected={ this.state.selected }
				tableProps= {{
					fixedHeader: true,
					fixedFooter: false,
					selectable: true,
					multiSelectable: true,
					height: this.props.window.height - 80,
					onRowSelection: (v) => {this._update = true;this.setState({ selected: v })}
				}}
				tableHeaderProps={ {
					displaySelectAll: true,
					enableSelectAll: true,
					adjustForCheckbox: true,
				}}
				tableBodyProps={ {
					stripedRows: true,
					showRowHover: true,
					deselectOnClickaway: false,
					displayRowCheckbox: true,
				}}
			/>)
			
	}
	
	render ( ) { 
		debug('## render  ##  Timers  render', this.props, this.state);
			let ret = <div style={{ padding: 50 }}><span style={{ color: 'white' }} children="Preparing Timer Data" /><br /><LinearProgress mode="indeterminate" /></div>;
		let sort = this.props.location.query.sortTimersBy || 'start';
		if ( sort === 'nextToAir' ) sort = 'start';
		let up = this.props.location.query.sortTimersDown || 'asc';
		let menu = <span />;
		if (this.props.recordings) {
			
			ret = sortBy( this.props.timers, [ sort ] );
			if ( up === 'desc' ) ret.reverse();

			menu = (<div style={{ padding: '0 0px' }}>
				<div style={{ position: 'absolute', top: 15, right: 0, width: 150, height: 50, zIndex: 1000 }}>
					<FontIcon className="material-icons" title=" Sort by Name" hoverColor={Styles.Colors.limeA400} color={sort === 'name' ? Styles.Colors.limeA400 : 'white' }  style={{cursor:'pointer'}} onClick={ () => { this.props.goTo({ path: '/tv/timers/', query: {sortTimersBy: 'name', sortTimersDown: up === 'asc' ? 'desc' : 'asc'  }, page: 'Timers by name'}); } }>sort_by_alpha</FontIcon>
					<span> &nbsp; </span>
					<FontIcon className="material-icons" title="Sort by time" hoverColor={Styles.Colors.limeA400} color={sort === 'start' ? Styles.Colors.limeA400 : 'white' } style={{cursor:'pointer'}}  onClick={ () => { this.props.goTo({ path: '/tv/timers/', query: {sortTimersBy: 'nextToAir', sortTimersDown: up === 'asc' ? 'desc' : 'asc'  }, page: 'Timers by next to air'}); } } >access_time</FontIcon>
					<span> &nbsp; </span>
					<FontIcon className="material-icons" title="View Series Passes" hoverColor={Styles.Colors.limeA400} color={ 'white' } style={{cursor:'pointer'}}  onClick={ () => { this.props.goTo({ path: '/tv/series/', query: {sortSeriesBy: this.props.location.query.sortTimersBy}, page: 'Series by next to air'}); } } >dvr</FontIcon>
				</div>
				
				{this.renderSchedule( ret )}
				</div>
			);
		}
		
		return (<div style={{ padding: '0 0px',  maxHeight: this.props.window.height-80, overflow: 'hidden'  }}>
			<div className="col-xs-8 col-sm-9"  >
				{menu}
			</div>
			<div className="col-xs-4 col-sm-3" >
				<FlatButton 
					title={ "Delete Selected Timers" } 
					backgroundColor={Styles.Colors.red800}
					hoverColor={Styles.Colors.red400}
					onClick={ e=>{ this.deleteTimers( ret, this.state.selected ) }  } 
					icon={<FontIcon className="material-icons" children='delete_sweep' />}
					label={ " Delete Selected Timers " }
				/>
				<div className="" style={{ maxHeight: this.props.window.height-110, overflow: 'auto' }}>
					{this.state.selected.map(e => (<div style={{ padding: 5}}>{ret[e].name} - {moment.unix(ret[e].startTime).format('L LT')}</div>))}
				</div>
			</div>
		</div>);
	}
	
	deleteTimers = ( timers = [], selected = [] ) => {
		Gab.emit('confirm open', {
			title: 'Cancel Timers',
			html: "Do you want to remove " + selected.length + " scheduled timers?",
			answer: ( yesno ) => { 
				if ( yesno) {
					Gab.emit('confirm open', { 
						style: { backgroundColor: Styles.Colors.red300 },
						title: 'This is Permanent',
						open: true,
						html: "Are you positive? This will permanently remove " + selected.length + " scheduled timers",
						answer: ( yesno ) => { 
							Gab.emit('confirm open', { open: false });
							if ( yesno ) {
								const send = {
									//startTime: program.startTime, // Start date and time of listing
									//title: program.title, // name of listing
									//channel:  this.props.renderChannel.channel,
									//channelName:  this.props.renderChannel.channelName,
									//timerId: timer.timerId 
								}
								//debug('Cancel Recording Program', send);
								//this.props.deleteTimer( send ); 
							}
						},
						yesText: 'Permanently Delete', 
						noStyle: {
							backgroundColor: 'initial',
							labelStyle: {
								color: 'white',
							}
						},
						yesStyle: {
							backgroundColor: Styles.Colors.red800,
							labelStyle: {
								color: 'white',
							}
						}
					});
				} else {
					Gab.emit('confirm open', { open: false });
				}
			},
			open: true,
			noText: 'Cancel',
			yesText: ' DELETE Timer', 
			noStyle: {
				backgroundColor: 'initial',
				labelStyle: {
					color: 'white',
				}
			},
			yesStyle: {
				backgroundColor: Styles.Colors.red800,
				labelStyle: {
					color: 'white',
				}
			}
		})
	}
	
}

Timers.getInitialData = function(params) {
	
	let ret = {}
	console.log('### RUN getInitialData Timers ###',  params);
	return {}
}
