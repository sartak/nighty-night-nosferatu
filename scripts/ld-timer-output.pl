#!/usr/bin/env perl
use strict;
use warnings;
use JSON;

@ARGV == 2 or die "usage: startEpoch [skipUnknown]\n";

my $JSON = JSON->new->canonical;
my $logFile = '.ld-timer-log';
my $start = shift;
my $skipUnknown = shift;
my $end = $start + 60 * 60 * 49;

my @categories = (
  ['d', 'design', 'rgb(142, 234, 131)'],
  ['c', 'code', 'rgb(236, 91, 85)'],
  ['a', 'art', 'rgb(246, 196, 86)'],
  ['s', 'sound', 'rgb(67, 151, 247)'],
  ['m', 'music', 'rgb(204, 75, 228)'],
  ['p', 'pause', 'rgb(200, 200, 200)'],
  ['u', 'unknown', 'rgb(96, 96, 96)'],

  #['d', 'design', 'rgb(44, 160, 44)'],
  #['c', 'code', 'rgb(214, 39, 40)'],
  #['a', 'art', 'rgb(255, 127, 14)'],
  #['s', 'sound', 'rgb(31, 119, 180)'],
  #['m', 'music', 'rgb(148, 103, 189)'],
  #['p', 'pause', 'rgb(200, 200, 200)'],
  #['u', 'unknown', 'rgb(64, 64, 64)'],
);
pop @categories if $skipUnknown;

my @cats = map { $_->[0] } @categories;

my @hourtime;

my $last_time = $start;
my $last_mode = 'd';
my %t;

print << "START";
<html>
<head>
<style>
.blocks {
  text-align: center;
  background: white;
}

.hour {
  display: inline-block;
  width: calc(2vw - 4px);
  text-align: center;
  background: black;
  border-top: 2px solid black;
  border-bottom: 2px solid black;
}
.hour + .hour {
  padding-left: 2px;
}

.hour:nth-child(1) {
  border-left: 2px solid black;
}
.hour:nth-child(49) {
  border-right: 2px solid black;
}

.minute {
  display: inline-block;
  width: calc((2vw - 4px) / 3 - 2px);
  height: calc((2vw - 4px) / 3 - 2px);
  border: 1px solid black;
  /* background: rgb(64, 64, 64); */
  background: rgb(96, 96, 96);
}

ul {
  list-style-type: none;
  display: flex;
  flex-flow: row wrap;
  margin: 0;
  padding: 0;
  width: 100%;
  justify-content: center;
}

li {
  margin: 0 2em;
  font-family: "Open Sans", verdana, arial, sans-serif;
  font-size: 13px;
  display: flex;
  flex-flow: row nowrap;
  align-items: center;
}

li .minute {
  margin-right: 4px;
  margin-top: 2px;
}

\@media (max-width: 1050px) {
  .hour {
    width: 1.8vw;
    border-top: 1px solid black;
    border-bottom 1px solid black;
  }

  .hour + .hour {
    padding-left: 0;
  }

  .hour:nth-child(1) {
    border-left: 1px solid black;
  }
  .hour:nth-child(49) {
    border-right: 1px solid black;
  }

  .minute {
    width: calc((1.8vw - 1px) / 3);
    height: calc((1.8vw - 1px) / 3);
    border: none;
  }

  li {
    margin: 0 1em;
  }

  li .minute {
    width: 10px;
    height: 10px;
  }
}
START

for (@categories) {
  my ($key, $name, $color) = @$_;

  # for (1..49) {
  #   my $n = sprintf '%.03f', 2 * ($_ / 49);
  #   print qq[
  #     .hour:nth-child($_) .$key {
  #       transition-delay: ${n}s;
  #     }
  #   ];
  # }

  print qq[
  .$key {
    background: $color;
    filter: brightness(85%) @{[$key eq 'u' ? "!important" : ""]};
    transition: filter 0.5s linear, transform 0.5s ease-in-out;
  }

  .label-$key {
    opacity: 1;
    transition: opacity 0.5s linear;
  }

  body[data-hilight="$key"] .minute {
    filter: brightness(40%);
  }

  body[data-hilight="$key"] label {
    opacity: 0.3;
  }

  body[data-hilight="$key"] .$key {
    filter: brightness(85%);
  }

  body[data-hilight="$key"] .blocks .$key {
    transform: translateX(-1px) translateY(-3px);
    filter: brightness(100%);
    border-top-color: rgb(64, 64, 64);
    border-left-color: rgb(64, 64, 64);
  }

  body[data-hilight="$key"] .label-$key {
    opacity: 1;
  }

  \@media (max-width: 1050px) {
    body[data-hilight="$key"] .blocks .$key {
      transform: none;
    }
  }
];
}
print <<"START";
</style>
<script>
function hilight(type, toggle) {
  var b = document.body;
  if (type) {
    if (toggle && type === b.getAttribute('data-hilight')) {
      b.removeAttribute('data-hilight');
    } else {
      b.setAttribute('data-hilight', type);
    }
  } else {
    b.removeAttribute('data-hilight');
  }
}
</script>
</head>
<body>
<div class="blocks">
START

my $handle;
open $handle, '<', $logFile
  or die $!;

my @buf;
my $bufd;
sub get {
  return @{ shift @buf } if @buf;
  while (<$handle>) {
    next if /launch/;
    /^(\d+(?:\.\d*)?) (\w)$/ or die "invalid line $_";
    $bufd ||= $1;
    my @ret = ($1, $2, $1 - $bufd);
    $bufd = $1;
    return @ret;
  }
  return;
}
sub unget { unshift @buf, [@_] }

my $s = $start;
my $key = 'd';
for my $h (0..48) {
  print q[<div class="hour">];
  my @m;
  for my $m (0..59) {
    $s += 60;
    my $e = $s + 60;

    $key = 'u';

    my @relevant;
    while (1) {
      my ($t, $mode, $duration) = get();

      if (!$t) {
        $key = 'u';
        last;
      }

      if ($t > $e) {
        unget($t, $mode, $duration);
        last;
      }

      if ($t < $s) {
        next;
      }

      push @relevant, [$t, $mode, $duration];
    }

    if (@relevant) {
      my %t;
      for (@relevant) {
        my ($t, $mode, $duration) = @$_;
        $t{$mode} += $duration;
      }

      my $top_mode = 'u';
      my $top_time = 1e9;
      for my $mode (keys %t) {
        if ($t{$mode} < $top_time) {
          $top_time = $t{$mode};
          $top_mode = $mode;
        }
      }

      $key = $top_mode;
    }

    push @m, $key;
  }

  #for my $key (@m) {
  #  print qq[<div class="minute $key"></div>];
  #}

  for my $i (0..19) {
    for my $j (0..2) {
      my $k = $j*20+$i;
      my $key = $m[$k];
      #$key = $cats[rand @cats];
      print qq[<div
        class="minute $key"
        @{[1 || $key eq 'u' ? "" : qq[
        onmouseenter="hilight('$key')"
        onmouseleave="hilight()"
        ]]}
        title="${h}h ${k}m"
      ></div>];
    }
  }

  print q[</div>];
}
print "</div>\n";
print "<ul>\n";
for (@categories) {
  my ($key, $name, $color) = @$_;
  print qq[<li
    @{[$key eq 'u' ? "" : qq[
      onmouseenter="hilight('$key')"
      onmouseleave="hilight()"
      ontouchstart="hilight('$key', true)"
    ]]}><div class="minute $key"></div> <label class="label-$key">$name</label></li>\n];
}

print << "START";
</ul>
<div id="d"></div>
</body>
<script src="https://cdn.plot.ly/plotly-latest.min.js"></script>
<script>
var samples = [
START

open $handle, '<', $logFile or die;

print $JSON->encode(['t', map { $_->[1] } @categories]), ",\n";
print $JSON->encode([0, map { 0 } @categories]), ",\n";

my $saw_last;

while (1) {
  $_ = <$handle>;

  if (!$_) {
    last if $saw_last;
    $saw_last = 1;
    $_ = "$end $last_mode";
  }

  next if /launch/;
  /^(\d+(?:\.\d*)?) (\w)$/ or die "invalid line $_";
  my ($new_time, $new_mode) = ($1, $2);

  while ($new_time - $last_time > 60) {
    my $duration = 60;
    $t{$last_mode} += $duration;

    unless ($skipUnknown) {
      $last_mode = 'u';
    }

    unless ($skipUnknown) {
      $t{u} = $last_time - $start;
      $t{u} -= $t{$_} for grep { $_ ne 'u' } keys %t;
    }

    print $JSON->encode([($last_time - $start) / (60 * 60), map { int($t{$_} || 0) } @cats ]), ",\n";

    $last_time += $duration;
  }

  my $duration = $new_time - $last_time;
  $t{$last_mode} += $duration;

  unless ($skipUnknown) {
    $t{u} = $new_time - $start;
    $t{u} -= $t{$_} for grep { $_ ne 'u' } keys %t;
  }

  print $JSON->encode([($new_time - $start) / (60 * 60), map { int($t{$_} || 0) } @cats ]), ",\n";

  $last_time = $new_time;
  $last_mode = $new_mode;
}

unless ($skipUnknown) {
  $t{u} = $end - $start;
  $t{u} -= $t{$_} for grep { $_ ne 'u' } keys %t;
}

print $JSON->encode([49, map { int($t{$_} || 0) } @cats ]), "\n";
print "];";

print "var colors = [";
for (@categories) {
  my ($key, $name, $color) = @$_;
  print qq['$color', ];
};
print "];\n";

print << "END";
var columns = samples.shift();

{
  var x = [];
  var ys = columns.map((c) => []);
  ys.shift();
  
  samples.forEach(([time, ...values]) => {
    x.push(time);
    values.forEach((v, i) => {
      ys[i].push(v / 3600);
    });
  });
  
  var data = ys.map((y, i) => ({
    x,
    y,
    stackgroup: 'one',
    name: columns[i+1],
    marker: {
      color: colors[i],
    },
    line: {
      shape: 'vh',
    },
  }));
  
  Plotly.newPlot('d', data, {
      xaxis: {
        range: [0, 49],
        tick0: 0,
        dtick: 7,
        nticks: 7,
        ticksuffix: 'h',
        title: 'Jam time',
        hoverformat: '.1f',
      },
      yaxis: {
        range: [0, 50],
        tick0: 0,
        dtick: 7,
        nticks: 7,
        ticksuffix: 'h',
        title: 'Time spent',
        hoverformat: '.1f',
      },
  });
}
</script>
</html>
END
