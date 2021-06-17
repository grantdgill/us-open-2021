var fantasy = fantasy || {};

(function($) {
    var url = `https://site.web.api.espn.com/apis/site/v2/sports/golf/leaderboard?league=pga&region=us&lang=en&event=${fantasy.config.tournamentId}`,
		_positions = {},
		headerTpl = Handlebars.compile($("#header-template").html()),
		golferTpl = Handlebars.compile($("#golfers-template").html()),
		teamTpl = Handlebars.compile($("#team-template").html()),
		_timeoutHook,
		_timeoutInterval = 20000,
		_refresher = $(".refresher"),
		_lastUpdated = $(".last-updated"),
		_competitors = [],
		_leaderboards = $(".leaderboard");

	function compare(a, b) {
        return b.totalScore - a.totalScore;
	}

	function compareScore(a, b) {
		return b.score - a.score;
    }
    
    function sortOrderComparator(a, b) {
        return a.sortOrder - b.sortOrder;
    }

	function _getGolfers(callback) {
		$.ajax({
			url:url,
			type:"GET",
			dataType:"jsonp",
			success:function(data) {
				callback(data);
			},
			error:function() {
				console.log("!!!ERROR");
			}
		});
	}

	function _getIndividualScore(golferId) {
        var golfer = _positions[golferId],
            total  = 0;
            
		if (golfer && golfer.place <= 25) {
			total = _scoreForPlace(golfer.place);
		}

		return total;
	}

	function _getTotalScore(team) {
		var total = 0;

		var golfer;
		team.forEach(function(golferId) {
			golfer = _positions[golferId];
			if(golfer) {
				if(golfer.place <= 25) {
					total += _scoreForPlace(golfer.place);
				}
			}
		});

		return total;
	}

	function _getIndividualDisplay(golferId) {
		var golfer = _positions[golferId];
		if (golfer) {
            return _.assign({}, golfer, {
                score : _getIndividualScore(golferId)
            });
        }
        
        return {};
    }

	function _scoreForPlace(place) {
		var score = 0;

		if(place === 1) {
			score = fantasy.config.firstPlaceValue;
		} else if(place <= 25) {
			score = 26 - place;
		}

		return score;
	}

	function _displayGolfers(data) {
		_getPositions(data);

		_displayTeams();

		var html = golferTpl({competitors:_competitors});
		$("#leaderboard").html(html);
	}

	function _displayTeams() {

		// order teams 
		var teams = [];

		fantasy.config.teams.forEach(function(team) {

			// get the total score
			var golferIds = team.golfers;

			var individuals = [];

			golferIds.forEach(function(id) {
				individuals.push(_getIndividualDisplay(id));
			});

			var totalScore = _getTotalScore(team.golfers);

			individuals.sort(compareScore);

			teams.push({
				name:team.name,
				individuals:individuals,
				totalScore:totalScore
			});
		});

		// order these by totalScore
		teams.sort(compare);

		_fantasyTeams = teams;

		// before resetting the html, grab any rows that are currently displaying the details.. so they can be
		// reshown afterwards
		var ids = _getExpandedTeams();

		var html = teamTpl({teams:teams});
		$("#fantasy-leaderboard").html(html);

		ids.forEach(function(id) {
			$("#" + id).find(".breakdown").addClass("showing");
		});
	}

	function _getExpandedTeams() {
		var $showing = $(".breakdown.showing");
		var ids = [];
		$showing.each(function() {
			ids.push($(this).closest(".team").attr("id"));
		});
		return ids;
	}

	function _getPositions(data) {
        var competitors = _.get(data, 'events.0.competitions.0.competitors', []),
            uniqueIds   = _getUniqueGolfers();

        competitors.sort(sortOrderComparator).forEach(function(competitor) {
            var athlete     = competitor.athlete || {},
                athleteId   = athlete.id;

            if (uniqueIds.indexOf(athleteId) > -1) {
                _positions[athleteId] = {
                    id      : athleteId,
                    name    : athlete.displayName,
                    place   : parseInt(_.get(competitor, 'status.position.id'), 10) || 100, // handle competitors with position id 0
                    score   : _.get(competitor, 'score.displayValue', '--'),
                    madeCut : true // @TODO
                };
            }
        });

        _competitors = competitors;
	}

	function updateTimeStamp() {
		var d = new Date();

		var hours = d.getHours();
		var minutes = d.getMinutes();
		var seconds = d.getSeconds();
		var half = "AM";

		if(minutes < 10) {
			minutes = "0" + minutes;
		}

		if(seconds < 10) {
			seconds = "0" + seconds;
		}

		if(hours >= 12) {
			half = "PM";
		}

		if(hours > 12) {
			hours = hours - 12;
		}

		if(hours === 0) {
			hours = 12;
		}

		_lastUpdated.html("Last Update: " + hours + ":" + minutes + ":" + seconds + " " + half);
	}

	function _refreshLeaderboards() {
		_refresher.show();
		_lastUpdated.hide();
		_getGolfers(function(data) {
			// map espn response to something more usable for us
			_displayGolfers(data);
			_refresher.hide();
			updateTimeStamp();
			_lastUpdated.show();
			_leaderboards.show();
			
			_timeoutHook = setTimeout(function() {
				_refreshLeaderboards();
			}, _timeoutInterval);
			
		});
	}

	function _getUniqueGolfers() {
		var all = [];
		fantasy.config.teams.forEach(function(team) {
            all = _.concat(all, team.golfers);
        });
        
        return _.uniq(all);
	}

	function _init() {
		var html = headerTpl(fantasy.config);
		$("#header").html(html);
		updateTimeStamp();
		_refreshLeaderboards();

		$(document).on("click", ".details", function(e) {
			e.preventDefault();
			var $breakdown = $(this).closest(".team").find(".breakdown");
			$breakdown.toggleClass("showing");
		});
	}

	Handlebars.registerHelper("getPosition", function(competitor) {
        return _.get(competitor, 'status.position.displayName', '--');
	});

	Handlebars.registerHelper("getTodaysScore", function(competitor) {
        var linescores = competitor.linescores || [],
            linescore  = linescores[linescores.length - 1] || {},
            score      = linescore.displayValue,
            thru       = _.get(competitor, 'status.displayThru');

        if (score && thru) {
            if (thru === '18') {
                thru = 'F';
            }

            return `${score} (${thru})`;
        }

        return score || '--';
	});

	Handlebars.registerHelper("getTotalPlayerScore", function(competitor) {
        var statistics = competitor.statistics || [],
            scoreToPar = _.find(statistics, { name: 'scoreToPar' });

        return scoreToPar && scoreToPar.displayValue || '--';
	});

	Handlebars.registerHelper("getPlayerClass", function(competitor) {
        var athleteId = _.get(competitor, 'athlete.id');
        if (_positions[athleteId]) {
            return 'highlight';
        }
    });

	Handlebars.registerHelper("getPoints", function(player) {
		return player.score === 1 ? "pt" : "pts";
	});

	Handlebars.logger.log = function(context) {
		return console.log(context);
	};

	Handlebars.registerHelper("debug", function(optionalValue) {
	  console.log("Current Context");
	  console.log("====================");
	  console.log(this);
	 
	  if (optionalValue) {
	    console.log("Value");
	    console.log("====================");
	    console.log(optionalValue);
	  }
	});

	$(document).ready(function() {
		_init();
	});
}(jQuery));