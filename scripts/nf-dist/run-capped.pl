#!/usr/bin/perl
# verify-installers.sh の1呼び出しに時間の上限をつける（macOS には timeout が無い）。
#
#   perl run-capped.pl <上限秒> <診断の置き場> <コマンド> [引数...]
#
# コマンドは自分のプロセスグループで、stdin を /dev/null にして動かす（呼んだ人の stdin に左右されない）。
# 終了コードはコマンドのもの（シグナルで終わったら 128+番号）。上限を過ぎたら、止まった様子（プロセスの一覧・
# Mac は sample のスタック・lsof）を診断の置き場に書いてから、グループごと TERM → 2 秒後に KILL して 124 で終わる。
# 途中で INT・TERM・HUP を受けたら、グループを止めてから同じシグナルで終わる（孫のプロセスを残さない）。
use strict;
use warnings;
use POSIX qw(setpgid _exit WNOHANG);

my ($secs, $diag, @cmd) = @ARGV;
die "usage: run-capped.pl <secs> <diag-dir> <cmd> [args...]\n"
  unless defined $diag && $secs =~ /^[1-9][0-9]*$/ && @cmd;

my $pid = fork();
die "fork: $!\n" unless defined $pid;
if ($pid == 0) {
  setpgid(0, 0);
  open(STDIN, '<', '/dev/null') or _exit(127);
  { no warnings 'exec'; exec { $cmd[0] } @cmd; }
  print STDERR "exec $cmd[0]: $!\n";
  _exit(127);
}
setpgid($pid, $pid); # 子が exec する前でもグループに送れるように、親からも決めておく

# グループ（pgid = 子の pid）の今のプロセス: "pid ppid stat etime command" の行
sub group_lines {
  my @out;
  open(my $ps, '-|', 'ps', '-A', '-o', 'pid=,ppid=,pgid=,stat=,etime=,command=') or return @out;
  while (my $l = <$ps>) {
    my @f = split(' ', $l, 6);
    push @out, join(' ', @f[0, 1, 3, 4], substr($f[5] // '', 0, 200)) if @f >= 5 && $f[2] == $pid;
  }
  close($ps);
  return @out;
}

my $reaped = 0;
sub stop_group {
  kill 'TERM', -$pid;
  for (1 .. 20) {
    $reaped ||= waitpid($pid, WNOHANG) == $pid;
    last if $reaped && !group_lines();
    select(undef, undef, undef, 0.1);
  }
  kill 'KILL', -$pid;
}

sub diagnose {
  my @lines = group_lines();
  system('mkdir', '-p', $diag);
  my $f = "$diag/hang-$pid.txt";
  if (open(my $fh, '>', $f)) {
    print $fh "command: @cmd\ncap: ${secs}s\nstdin: /dev/null\n\n# pid ppid stat etime command\n", map { "$_\n" } @lines;
    close($fh);
  }
  for my $l (@lines) {
    my ($p) = split(' ', $l);
    system("lsof -n -P -p $p >> '$f' 2>/dev/null");
    # Mac: 2 秒ぶんのスタック（どのスレッドが何を待っているか）
    system("/usr/bin/sample $p 2 -file '$diag/sample-$p.txt' > /dev/null 2>&1") if -x '/usr/bin/sample';
  }
  print STDERR "!! ${secs} 秒を過ぎても終わらないので打ち切りました（様子: $f）\n";
}

for my $sig (qw(INT TERM HUP)) {
  $SIG{$sig} = sub {
    stop_group();
    waitpid($pid, 0);
    $SIG{$sig} = 'DEFAULT';
    kill $sig, $$;
    _exit(128);
  };
}

my $status;
my $ok = eval {
  local $SIG{ALRM} = sub { die "cap\n" };
  alarm $secs;
  waitpid($pid, 0);
  $status = $?;
  $reaped = 1;
  alarm 0;
  1;
};
if (!$ok) {
  die $@ unless $@ eq "cap\n";
  diagnose();
  stop_group();
  waitpid($pid, 0);
  exit 124;
}
# 本体が終わった後もグループに残ったプロセス（孫）は止める（次の呼び出しや片付けを邪魔させない）
my @left = group_lines();
if (@left) {
  print STDERR "!! 終わった後に残ったプロセスを止めました: ", join(' / ', @left), "\n";
  stop_group();
}
exit(($status & 127) ? 128 + ($status & 127) : $status >> 8);
