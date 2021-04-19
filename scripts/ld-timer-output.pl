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

sub sizes {
  my ($width, $border, $hourMargin) = @_;

  my $out = << "START";
.blocks {
  width: ${width}vw;
  height: calc(2 * ${hourMargin}px + (${width}vw - 50 * ${hourMargin}px) / (49 * 3) * 20);
  margin-left: auto;
  margin-right: auto;
}

.minute {
  width: calc((${width}vw - 50 * ${hourMargin}px - 49 * 3 * ${border}px) / (49 * 3));
  height: calc((${width}vw - 50 * ${hourMargin}px - 49 * 3 * ${border}px) / (49 * 3));
}

li .minute {
  border: calc(${border}px*0.5) solid black;
}
START

  for my $x (0 .. 3 * 60) {
    my $hour = 1 + int($x / 3);
    $out .= qq[
      .x-$x {
        left: calc($hour * ${hourMargin}px + ${x} * (${width}vw - 50 * ${hourMargin}px) / (49 * 3) + ${border}*.5px);
      }
    ];
  }

  for my $y (0 .. 20) {
    $out .= qq[
      .y-$y {
        top: calc(${hourMargin}px + ${y} * (${width}vw - 50 * ${hourMargin}px) / (49 * 3) + ${border}*.5px);
      }
    ];
  }

  return $out;
}

print << "START";
<html>
<head>
<style>
@{[sizes(98, 2, 4)]}

.blocks {
  position: relative;
  background: black;
  margin-left: auto;
  margin-right: auto;
}

.minutes {
  position: absolute;
  top: 0;
  left: 0;
}

.minutes .minute {
  position: absolute;
}

.minute {
  display: block;
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

\@media (max-width: 1200px) {
  body {
    margin-left: 0;
    margin-right: 0;
  }

  @{[sizes(100, 0, 4)]}
}

\@media (max-width: 950px) {
  @{[sizes(100, 0, 0)]}

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

  print qq[
  .$key .minute, li .minute.$key {
    background: $color;
  }

  .$key {
    z-index: 0;
    filter: brightness(85%) @{[$key eq 'u' ? "!important" : ""]};
    transition: filter 0.3s linear, transform 0.3s linear;
  }

  .label-$key {
    opacity: 1 @{[$key eq 'u' ? "!important" : ""]};
    transition: opacity 0.3s linear;
  }

  body[data-hilight="$key"] .minutes,
  body[data-hilight="$key"] li .minute {
    filter: brightness(45%);
  }

  body[data-hilight="$key"] label {
    opacity: 0.3;
  }

  body[data-hilight="$key"] .minutes.$key,
  body[data-hilight="$key"] li .minute.$key {
    filter: brightness(85%);
  }

  body[data-hilight="$key"] .minutes.$key {
    transform: translateX(-1.5px) translateY(-3px);
    z-index: 1;
    filter: brightness(100%);
    transition: filter 0.3s linear, transform 0.9s cubic-bezier(.5,3.04,.49,.47);
  }

  body[data-hilight="$key"] .label-$key {
    opacity: 1;
  }

  \@media (max-width: 1200px) {
    body[data-hilight="$key"] .minutes,
    body[data-hilight="$key"] li .minute {
      filter: brightness(35%);
    }

    body[data-hilight="$key"] .minutes.$key {
      transform: none;
    }
  }
];
}
print <<"START";
</style>
<script>
var desiredHilight;
function hilight(type, toggle) {
  var b = document.body;
  if (!type || (toggle && type === b.getAttribute('data-hilight'))) {
    b.removeAttribute('data-hilight');
  }
  else {
    b.setAttribute('data-hilight', type);
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

my @m;

for my $h (0..48) {
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
}

#@m = map { $cats[rand @cats] } @m;

#for my $key (@m) {
#  print qq[<div class="minute $key"></div>];
#}

for my $cat (@cats) {
  print qq[<div class="minutes $cat">];

  for my $h (0..48) {
    for my $i (0..19) {
      for my $j (0..2) {
        my $k = $h*60+$j*20+$i;
        my $key = $m[$k];
        my $x = $h*3 + $j;
        my $y = $i;
        next if $key ne $cat;
        print qq[<div class="minute x-$x y-$y"></div>];
      }
    }
  }

  print qq[</div>];
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
