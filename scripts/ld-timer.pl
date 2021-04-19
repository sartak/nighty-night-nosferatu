#!/usr/bin/env perl
use strict;
use warnings;
use File::Slurp 'slurp';
use Term::ReadKey;
use Time::HiRes 'time';
use JSON ();

my $JSON = JSON->new;

$| = 1;
ReadMode 3;
END { ReadMode 0 }

@ARGV == 1 || @ARGV == 2 or die "usage: startEpoch [screenshotDir]\n";

my $stateFile = '.ld-timer-state';
my $logFile = '.ld-timer-log';
open my $logHandle, '>>', $logFile or die $!;
select((select($logHandle), $|=1)[0]);

print { $logHandle } sprintf "%.2f %s\n", time, '(launch)';

my $state = readState();
my $start = shift;
my $end = $start + 60 * 60 * 49;
my $screenshot_dir = shift;

my @categories = (
  ['d', 'design', 32],
  ['c', 'code', 31],
  ['a', 'art', 33],
  ['s', 'sound', 36],
  ['m', 'music', 35],
  ['p', 'pause', 37],
);

$state->{modetime} ||= { map { $_->[0] => 0 } @categories };
$state->{hourtime} ||= [];
my $modetime = $state->{modetime};
my $hourtime = $state->{hourtime};

my $duration = $end - $start;
my $mode = 'd';
my $last_screenshot = time;
my $last_time = time;
my $is_first = 1;

my %mode_key;
for (@categories) {
  my ($key) = @$_;
  $mode_key{$key} = $_;
}

while (1) {
  my $key = ReadKey($is_first ? -1 : 10);
  my $newmode;

  if (defined $key) {
    while (1) {
      if (defined $key) {
        # pause
        if ($key eq ' ') {
          $key = 'p';
        }

        if ($mode_key{$key} && $key ne $mode) {
          $newmode = $key;
          last;
        }
      }

      last if !defined $key;
      $key = ReadKey(-1);
    }
  }
  $is_first = 0;
  my $now = time;

  my $duration = $now - $last_time;

  my $progress = ($now - $start) / ($end - $start);
  $progress = $progress > 1 ? 1 : $progress < 0 ? 0 : $progress;
  my $hour = int(49 * $progress);

  if ($now >= $start && $now <= $end) {
    $modetime->{$mode} += $duration;
    $hourtime->[$hour]{$mode} += $duration;
    writeState();
    print { $logHandle } sprintf "%.2f %s\n", $now, $mode;
  }

  $last_time = $now;

  if (defined $newmode) {
    $mode = $newmode;
  }

  render($now);

  if ($screenshot_dir && $now - $last_screenshot > 10) {
    $last_screenshot = $now;
    system("/usr/sbin/screencapture -x $screenshot_dir/@{[int $now]}-1.png $screenshot_dir/@{[int $now]}-2.png 2>/dev/null");
  }
}

sub render {
  my $now = shift;

  print "\e[2J\e[0;0H";
  my $progress = ($now - $start) / ($end - $start);
  $progress = $progress > 1 ? 1 : $progress < 0 ? 0 : $progress;
  my $hour = int(49 * $progress);

  my $devtime = 0;
  $devtime += $modetime->{$_} for grep { $_ ne 'p' } keys %$modetime;

  printf "devtime: %s          walltime: %s / %s\n", fmt($devtime), fmt($now - $start), fmt($end - $start, 1);

  for my $i (0..48) {
    my $top_mode;
    my $top_time;

    for my $m (keys %{ $hourtime->[$i] }) {
      no warnings 'uninitialized';
      my $t = $hourtime->[$i]{$m};
      if (!defined($top_mode) || $t > $top_time) {
        $top_mode = $m;
        $top_time = $t;
      }
    }

    my $current = $progress < 1 && int($progress * 49) == $i;

    if ($top_mode) {
      if ($current) {
        printf "\e[%d;%dm", 1, 10 + $mode_key{$top_mode}[2];
      }
      printf "\e[%d;%dm", 1, $top_mode eq 'p' ? 30 : $mode_key{$top_mode}[2];
    } elsif ($progress > $i/49) {
      printf "\e[%d;%dm", 1, 30;
    }

    if ($current) {
      print "*";
    }
    elsif ($progress > $i/49) {
      print "#";
    }
    else {
      print ".";
    }

    print "\e[39m\e[49m\e[0m";
  }

  print "\n";
  my $len = 0;
  for (@categories) {
    my ($key, $label, $color) = @$_;

    my $hilite = sprintf "\e[1;%dm", $color;
    my $lolite = sprintf "\e[0;%dm", $color;
    my $reset = "\e[m";

    if ($mode eq $key) {
      $lolite = $hilite;
    }

    my $t = $modetime->{$key};
    my $s = sprintf "%s[%s] ", $label, fmt($t, 1);
    my $l = length($s);

    $s = sprintf "%s%s%s", $lolite, $s, $reset;

    if ($len + $l > 49) {
      print "\n";
      $len = 0;
    }
    $len += $l;
    print $s;
  }

  if ($hour > 0) {
    printf "\e[%d;%dH", 2, $hour+1;
  } else {
    printf "\e[%d;0H", 2;
  }
}

sub fmt {
  my $s = shift;
  my $skipSign = shift;
  my $sign = $s < 0 ? "-" : " ";
  $sign = "" if $skipSign;

  $s = abs($s);

  my $m = int($s / 60);
  $s -= $m * 60;

  my $h = int($m / 60);
  $m -= $h * 60;

  sprintf "%s%02d:%02d", $sign, $h, $m;
}

sub readState {
  return {} unless -e $stateFile;
  return $JSON->decode(scalar slurp $stateFile);
}

sub writeState {
  open my $handle, '>', $stateFile;
  print $handle $JSON->encode($state);
  close $handle;
}
